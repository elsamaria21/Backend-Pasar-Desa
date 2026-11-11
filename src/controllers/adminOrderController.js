
const crypto = require("crypto");
const { pool } = require("../config/database");

const STATUS = new Set(["pending", "perlu-dikemas", "diproses", "siap-jemput", "sedang-dikemas", "dikirim", "diantar", "tiba-di-pos", "komplain", "selesai", "dibatalkan"]);

// Status lama disamakan dengan status dashboard sebelum alur diperiksa.
const SETARA = { diproses: "perlu-dikemas", "sedang-dikemas": "perlu-dikemas", dikirim: "diantar" };
const normal = (s) => SETARA[s] || s;

// Alur hidup pesanan (sama dengan dashboard). Loncat status ditolak agar kas & stok tidak salah catat.
const ALUR = {
  pending: ["perlu-dikemas", "dibatalkan"],
  "perlu-dikemas": ["siap-jemput", "dibatalkan"],
  "siap-jemput": ["diantar", "tiba-di-pos", "dibatalkan"], // ambil mandiri melewati "diantar"
  diantar: ["tiba-di-pos", "dibatalkan"],
  "tiba-di-pos": ["selesai", "komplain", "dibatalkan"],
  komplain: ["selesai", "perlu-dikemas", "dibatalkan"], // pengganti → kemas ulang
  selesai: ["dibatalkan"], // koreksi admin; kas dibalik
  dibatalkan: [],
};
const bolehPindah = (dari, ke) => normal(dari) === normal(ke) || (ALUR[normal(dari)] || []).includes(normal(ke));

// Pembeli mobile TIDAK boleh menentukan harga, status, atau kode (dihitung server). Hanya admin.
const kodePesanan = () => `PSD-${Date.now()}-${crypto.randomInt(1000, 9999)}`;

// :id boleh id numerik atau kode pesanan (mis. PSD-20261024-0089), supaya dashboard cukup memakai kode.
const kondisiId = (param) => (/^\d+$/.test(String(param)) ? { sql: "id = ?", value: Number(param) } : { sql: "order_code = ?", value: String(param) });

// Nilai item yang di-refund pada komplain (hak pembeli, bukan penjual).
function nilaiRefund(komplain) {
  if (!komplain || !Array.isArray(komplain.items)) return 0;
  return komplain.items.reduce((sum, item) => (item.penyelesaian === "refund" ? sum + (Number(item.nilai) || 0) : sum), 0);
}

// Mengembalikan stok semua item pesanan yang punya productId (saat pesanan dibatalkan/dihapus).
async function restoreStock(connection, orderId) {
  const [items] = await connection.query("SELECT product_id, quantity FROM dashboard_order_items WHERE order_id = ? AND product_id IS NOT NULL", [orderId]);
  for (const item of items) {
    await connection.query("UPDATE products SET stock = stock + ? WHERE id = ?", [item.quantity, item.product_id]);
  }
}

// Satu pintu pembaca pesanan + itemnya (satu query item untuk semua pesanan, bukan per pesanan).
async function bacaPesanan(db, kondisi = "", params = []) {
  const [rows] = await db.query(
    `SELECT id, order_code AS kode, id_pembayaran AS idPembayaran, user_id AS userId, customer_name AS pembeli,
       address AS alamat, rt_rw AS rtRw, patokan, drop_point AS dropPoint, opsi_pengiriman AS opsiPengiriman,
       payment_method AS metodeBayar, phone AS telepon, notes AS catatan, status, total,
       tiba_di_pos_pada AS tibaDiPosPada, kurir, komplain, kirim_ulang AS kirimUlang, created_at AS dibuatPada
     FROM dashboard_orders ${kondisi} ORDER BY created_at DESC, id DESC`,
    params
  );
  if (!rows.length) return rows;
  const [items] = await db.query(
    `SELECT order_id AS orderId, product_id AS productId, product_name AS komoditas, quantity AS jumlah,
       unit AS satuan, unit_price AS hargaSatuan, subtotal, tag
     FROM dashboard_order_items WHERE order_id IN (?) ORDER BY id`,
    [rows.map((r) => r.id)]
  );
  const perPesanan = new Map();
  for (const { orderId, ...item } of items) {
    if (!perPesanan.has(orderId)) perPesanan.set(orderId, []);
    perPesanan.get(orderId).push(item);
  }
  for (const row of rows) {
    row.items = perPesanan.get(row.id) || [];
    row.kirimUlang = Boolean(row.kirimUlang);
  }
  return rows;
}

async function listOrders(req, res) {
  try {
    res.json({ success: true, data: await bacaPesanan(pool) });
  } catch (error) {
    console.error("ADMIN LIST ORDERS:", error);
    res.status(500).json({ success: false, message: "Gagal mengambil pesanan." });
  }
}

async function createOrder(req, res) {
  const body = req.body || {};
  const items = Array.isArray(body.items) ? body.items : [];
  const privileged = !req.isMobileOrder && req.user?.role === "admin";

  if (!body.pembeli && !body.customer_name && !(body.userId || body.user_id)) return res.status(400).json({ success: false, message: "Nama pembeli atau userId wajib diisi." });
  if (!items.length) return res.status(400).json({ success: false, message: "Minimal satu item pesanan wajib diisi." });
  if (body.opsiPengiriman && !["kurir-desa", "ambil-mandiri"].includes(body.opsiPengiriman)) return res.status(400).json({ success: false, message: "Opsi pengiriman tidak valid." });

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    let total = 0;
    const normalized = [];
    const stokTersisa = new Map(); // satu produk bisa muncul di beberapa baris: stok dihitung kumulatif

    for (const item of items) {
      const productId = item.productId || item.product_id || null;
      if (!productId && !privileged) throw new Error("Setiap item pesanan harus memiliki productId.");

      let product = null;
      if (productId) {
        const [products] = await connection.query("SELECT id, name, price, stock, unit, tag, is_visible FROM products WHERE id = ? FOR UPDATE", [productId]);
        if (!products.length) throw new Error(`Produk ${productId} tidak ditemukan.`);
        product = products[0];
        if (!privileged && !product.is_visible) throw new Error(`Produk ${product.name} tidak tersedia.`);
      }

      const quantity = Number(item.jumlah ?? item.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("Jumlah item tidak valid.");

      // Harga: dari database. Admin boleh menimpanya (mis. harga negosiasi), pembeli tidak.
      const hargaKlien = item.hargaSatuan ?? item.unit_price;
      const price = privileged && hargaKlien !== undefined ? Number(hargaKlien) : Number(product?.price ?? 0);
      if (!Number.isFinite(price) || price < 0) throw new Error("Harga item tidak valid.");

      if (product) {
        const sisa = stokTersisa.has(product.id) ? stokTersisa.get(product.id) : Number(product.stock);
        if (sisa < quantity) throw new Error(`Stok ${product.name} tidak mencukupi.`);
        stokTersisa.set(product.id, sisa - quantity);
      }

      const subtotal = quantity * price;
      total += subtotal;
      normalized.push({
        productId: product?.id || null,
        name: product?.name || item.komoditas || item.product_name || "Komoditas",
        quantity,
        unit: product?.unit || item.satuan || item.unit || "kg",
        price,
        subtotal,
        tag: product?.tag || item.tag || null,
      });
    }

    const orderCode = privileged && (body.kode || body.order_code) ? body.kode || body.order_code : kodePesanan();
    const status = privileged && STATUS.has(body.status) ? body.status : req.isMobileOrder ? "perlu-dikemas" : "pending";
    let customerName = body.pembeli || body.customer_name;
    const userId = body.userId || body.user_id || null;
    if (!customerName && userId) {
      const [users] = await connection.query("SELECT name FROM users WHERE id = ? LIMIT 1", [userId]);
      customerName = users[0]?.name || "Pengguna Mobile";
    }

    const [result] = await connection.query(`
      INSERT INTO dashboard_orders
      (order_code, id_pembayaran, user_id, customer_name, address, rt_rw, patokan, drop_point, opsi_pengiriman, payment_method, phone, notes, status, total)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [orderCode, body.idPembayaran || null, userId, customerName, body.alamat || body.address || null, body.rtRw || null, body.patokan || null,
      body.dropPoint || body.drop_point || null, body.opsiPengiriman || "kurir-desa", body.metodeBayar || body.payment_method || null, body.telepon || body.phone || null,
      body.catatan || body.notes || null, status, total]);

    for (const item of normalized) {
      await connection.query(`
        INSERT INTO dashboard_order_items (order_id, product_id, product_name, quantity, unit, unit_price, subtotal, tag)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [result.insertId, item.productId, item.name, item.quantity, item.unit, item.price, item.subtotal, item.tag]);
      if (item.productId) await connection.query("UPDATE products SET stock = stock - ? WHERE id = ?", [item.quantity, item.productId]);
    }

    await connection.commit();
    res.status(201).json({ success: true, message: "Pesanan berhasil dibuat.", data: { id: result.insertId, kode: orderCode, total, status } });
  } catch (error) {
    await connection.rollback();
    if (error.code === "ER_DUP_ENTRY") return res.status(409).json({ success: false, message: "Kode pesanan sudah dipakai." });
    res.status(400).json({ success: false, message: error.message || "Gagal membuat pesanan." });
  } finally { connection.release(); }
}

function objekAtauNull(nilai, nama) {
  if (nilai === null) return null;
  if (typeof nilai !== "object" || Array.isArray(nilai)) throw new Error(`${nama} harus berupa objek atau null.`);
  return JSON.stringify(nilai);
}

// Inti pembaruan pesanan, dipakai admin (updateOrder) dan pembeli (konfirmasi terima / komplain dari mobile).
// Mengembalikan { code, body } agar pemanggil yang menulis respons. `userId` (opsional) membatasi pesanan
// ke milik pembeli itu; pesanan orang lain dianggap tidak ada.
async function terapkanUpdate(kondisi, body, userId) {
  const gagal = (code, message) => ({ code, body: { success: false, message } });
  const fields = [];
  const values = [];
  // `total` sengaja tidak bisa diubah langsung: nilainya berasal dari item pesanan.
  const map = { pembeli: "customer_name", alamat: "address", rtRw: "rt_rw", patokan: "patokan", dropPoint: "drop_point", metodeBayar: "payment_method", telepon: "phone", catatan: "notes" };
  for (const [key, column] of Object.entries(map)) if (body[key] !== undefined) { fields.push(`${column} = ?`); values.push(body[key]); }

  try {
    if (body.opsiPengiriman !== undefined) {
      if (!["kurir-desa", "ambil-mandiri"].includes(body.opsiPengiriman)) throw new Error("Opsi pengiriman tidak valid.");
      fields.push("opsi_pengiriman = ?"); values.push(body.opsiPengiriman);
    }
    if (body.kurir !== undefined) { fields.push("kurir = ?"); values.push(objekAtauNull(body.kurir, "kurir")); }
    if (body.komplain !== undefined) { fields.push("komplain = ?"); values.push(objekAtauNull(body.komplain, "komplain")); }
    if (body.tibaDiPosPada !== undefined) {
      const tgl = body.tibaDiPosPada === null ? null : new Date(body.tibaDiPosPada);
      if (tgl !== null && Number.isNaN(tgl.getTime())) throw new Error("tibaDiPosPada bukan tanggal yang valid.");
      fields.push("tiba_di_pos_pada = ?"); values.push(tgl);
    }
    if (body.kirimUlang !== undefined) { fields.push("kirim_ulang = ?"); values.push(body.kirimUlang ? 1 : 0); }
    if (body.status !== undefined) {
      if (!STATUS.has(body.status)) throw new Error("Status pesanan tidak valid.");
      fields.push("status = ?"); values.push(body.status);
    }
  } catch (e) {
    return gagal(400, e.message);
  }
  if (!fields.length) return gagal(400, "Tidak ada perubahan yang dikirim.");

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const milik = userId ? " AND user_id = ?" : "";
    const [beforeRows] = await connection.query(
      `SELECT id, status, total, order_code, komplain FROM dashboard_orders WHERE ${kondisi.sql}${milik} FOR UPDATE`,
      userId ? [kondisi.value, userId] : [kondisi.value]
    );
    if (!beforeRows.length) {
      await connection.rollback();
      return gagal(404, "Pesanan tidak ditemukan.");
    }
    const before = beforeRows[0];
    const id = before.id;
    const statusBaru = body.status;

    if (statusBaru !== undefined && !bolehPindah(before.status, statusBaru)) {
      await connection.rollback();
      return gagal(409, `Status tidak bisa berubah dari "${before.status}" ke "${statusBaru}".`);
    }

    await connection.query(`UPDATE dashboard_orders SET ${fields.join(", ")} WHERE id = ?`, [...values, id]);

    // Selesai → catat penjualan ke kas, sekali per pesanan. Yang dicatat nilai BERSIH: total dikurangi item yang
    // di-refund pada komplain (komplain terbaru dari body, atau yang sudah tersimpan).
    if (statusBaru === "selesai" && before.status !== "selesai") {
      const komplain = body.komplain !== undefined ? body.komplain : before.komplain;
      const bersih = Number(before.total || 0) - nilaiRefund(komplain);
      const reference = `PESANAN-${id}`;
      const [existing] = await connection.query("SELECT id FROM dashboard_cash_transactions WHERE reference_code = ? LIMIT 1", [reference]);
      if (!existing.length && bersih > 0) {
        await connection.query(
          "INSERT INTO dashboard_cash_transactions (type, category, description, amount, reference_code) VALUES ('credit', 'penjualan', ?, ?, ?)",
          [`Penjualan pesanan ${before.order_code}`, bersih, reference]
        );
      }
    }

    // Dibatalkan → stok kembali; bila sebelumnya selesai, kas dikoreksi sebesar yang pernah dicatat.
    if (statusBaru === "dibatalkan" && before.status !== "dibatalkan") {
      await restoreStock(connection, id);
      if (before.status === "selesai") {
        const [dicatat] = await connection.query("SELECT amount FROM dashboard_cash_transactions WHERE reference_code = ? LIMIT 1", [`PESANAN-${id}`]);
        const reference = `PESANAN-${id}-BATAL`;
        const [sudah] = await connection.query("SELECT id FROM dashboard_cash_transactions WHERE reference_code = ? LIMIT 1", [reference]);
        if (dicatat.length && !sudah.length) {
          await connection.query(
            "INSERT INTO dashboard_cash_transactions (type, category, description, amount, reference_code) VALUES ('debit', 'penjualan', ?, ?, ?)",
            [`Pembatalan pesanan ${before.order_code}`, Number(dicatat[0].amount), reference]
          );
        }
      }
    }

    await connection.commit();
    const [terbaru] = await bacaPesanan(pool, "WHERE id = ?", [id]);
    return { code: 200, body: { success: true, message: "Pesanan diperbarui.", data: terbaru } };
  } catch (error) {
    await connection.rollback();
    console.error("UPDATE ORDER:", error);
    return gagal(500, "Gagal memperbarui pesanan.");
  } finally { connection.release(); }
}

async function updateOrder(req, res) {
  const hasil = await terapkanUpdate(kondisiId(req.params.id), req.body || {});
  res.status(hasil.code).json(hasil.body);
}

async function deleteOrder(req, res) {
  const kondisi = kondisiId(req.params.id);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query(`SELECT id, status FROM dashboard_orders WHERE ${kondisi.sql} FOR UPDATE`, [kondisi.value]);
    if (!rows.length) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: "Pesanan tidak ditemukan." });
    }
    // Pesanan selesai sudah tercatat di kas; batalkan dulu agar kas ikut terkoreksi.
    if (rows[0].status === "selesai") {
      await connection.rollback();
      return res.status(409).json({ success: false, message: "Pesanan selesai tidak bisa dihapus. Batalkan dulu agar kas terkoreksi." });
    }
    if (rows[0].status !== "dibatalkan") await restoreStock(connection, rows[0].id);
    await connection.query("DELETE FROM dashboard_orders WHERE id = ?", [rows[0].id]);
    await connection.commit();
    res.json({ success: true, message: "Pesanan dihapus." });
  } catch (error) {
    await connection.rollback();
    console.error("ADMIN DELETE ORDER:", error);
    res.status(500).json({ success: false, message: "Gagal menghapus pesanan." });
  } finally { connection.release(); }
}

module.exports = { listOrders, createOrder, updateOrder, deleteOrder, restoreStock, bolehPindah, nilaiRefund, terapkanUpdate, kondisiId };

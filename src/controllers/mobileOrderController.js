const { pool } = require("../config/database");
const { createOrder, restoreStock, terapkanUpdate, kondisiId } = require("./adminOrderController");

const { normalisasiFoto } = require("../utils/evidence");

const ALASAN_VALID = ["tidak-segar", "tidak-sesuai-timbangan", "kemasan-rusak", "tidak-sesuai-pesanan", "lainnya"];

async function listMyOrders(req, res) {
  try {
    const [rows] = await pool.query(`
      SELECT o.id, o.order_code AS order_code, o.user_id, o.customer_name, o.address, o.rt_rw, o.patokan, o.drop_point, o.opsi_pengiriman,
        o.payment_method, o.phone, o.notes, o.status, o.total, o.kurir, o.komplain, o.tiba_di_pos_pada, o.created_at,
        o.alasan_batal, o.dibatalkan_oleh, r.rating AS ulasan_rating
      FROM dashboard_orders o LEFT JOIN order_reviews r ON r.order_id = o.id
      WHERE o.user_id = ? ORDER BY o.created_at DESC, o.id DESC
    `, [req.user.id]);
    for (const order of rows) {
      const [items] = await pool.query(`
        SELECT product_id, product_name, quantity, unit, unit_price AS price, subtotal, tag
        FROM dashboard_order_items WHERE order_id = ? ORDER BY id
      `, [order.id]);
      order.items = items;
    }
    res.json({ success: true, data: rows });
  } catch (e) {
    console.error("MOBILE LIST ORDERS:", e);
    res.status(500).json({ success: false, message: "Gagal mengambil pesanan pengguna." });
  }
}

async function createMyOrder(req, res) {
  // Pesanan dari mobile: pembeli = akun yang login; harga/status/kode dihitung server (lihat createOrder).
  req.isMobileOrder = true;
  req.body = { ...(req.body || {}), userId: req.user.id };
  return createOrder(req, res);
}

async function getMyOrder(req, res) {
  try {
    const k = kondisiId(req.params.id);
    const [rows] = await pool.query(`SELECT * FROM dashboard_orders WHERE ${k.sql} AND user_id = ? LIMIT 1`, [k.value, req.user.id]);
    if (!rows.length) return res.status(404).json({ success: false, message: "Pesanan tidak ditemukan." });
    const [items] = await pool.query("SELECT product_id, product_name, quantity, unit, unit_price AS price, subtotal, tag FROM dashboard_order_items WHERE order_id = ? ORDER BY id", [rows[0].id]);
    res.json({ success: true, data: { order: rows[0], items } });
  } catch (e) { res.status(500).json({ success: false, message: "Gagal mengambil detail pesanan." }); }
}

// :id boleh id angka atau kode pesanan (app mobile memakai kode, mis. PSD-1793...).
async function cancelMyOrder(req, res) {
  const k = kondisiId(req.params.id);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query(
      `SELECT id FROM dashboard_orders WHERE ${k.sql} AND user_id = ? AND status IN ('pending','perlu-dikemas') FOR UPDATE`,
      [k.value, req.user.id]
    );
    if (!rows.length) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: "Pesanan tidak ditemukan atau sudah diproses." });
    }
    // Alasan pembatalan dari pembeli tersimpan agar terlihat di dashboard admin.
    const alasan = String(req.body?.alasan || "").trim().slice(0, 255) || null;
    await connection.query(
      "UPDATE dashboard_orders SET status = 'dibatalkan', dibatalkan_oleh = 'pembeli', alasan_batal = ?, dibatalkan_pada = NOW() WHERE id = ?",
      [alasan, rows[0].id]
    );
    await restoreStock(connection, rows[0].id); // stok yang dipesan dikembalikan
    await connection.commit();
    res.json({ success: true, message: "Pesanan dibatalkan." });
  } catch (e) {
    await connection.rollback();
    console.error("MOBILE CANCEL ORDER:", e);
    res.status(500).json({ success: false, message: "Gagal membatalkan pesanan." });
  } finally { connection.release(); }
}

// Pembeli hanya boleh bertindak (terima / komplain) setelah paket tiba di pos drop-point.
async function pesananTibaDiPos(req, res) {
  const k = kondisiId(req.params.id);
  const [rows] = await pool.query(`SELECT id, status FROM dashboard_orders WHERE ${k.sql} AND user_id = ? LIMIT 1`, [k.value, req.user.id]);
  if (!rows.length) {
    res.status(404).json({ success: false, message: "Pesanan tidak ditemukan." });
    return null;
  }
  if (rows[0].status !== "tiba-di-pos") {
    const message = rows[0].status === "selesai"
      ? "Pesanan sudah selesai. Komplain hanya bisa diajukan sebelum pesanan dikonfirmasi diterima."
      : "Pesanan belum tiba di pos drop-point.";
    res.status(409).json({ success: false, message });
    return null;
  }
  return { kondisi: k, id: rows[0].id };
}

// Pembeli mengonfirmasi pesanan diterima → selesai; server mencatat penjualan ke kas penjual.
async function receiveMyOrder(req, res) {
  try {
    const pesanan = await pesananTibaDiPos(req, res);
    if (!pesanan) return;
    const hasil = await terapkanUpdate(pesanan.kondisi, { status: "selesai" }, req.user.id);
    res.status(hasil.code).json(hasil.body);
  } catch (e) {
    console.error("MOBILE RECEIVE ORDER:", e);
    res.status(500).json({ success: false, message: "Gagal mengonfirmasi penerimaan." });
  }
}

// Pembeli mengajukan komplain/retur → pesanan "komplain", dana ditahan sampai penjual/BUMDes memutuskan.
// Semua item pesanan ikut dikomplain; foto bukti belum didukung app.
async function komplainMyOrder(req, res) {
  try {
    const pesanan = await pesananTibaDiPos(req, res);
    if (!pesanan) return;
    const alasan = ALASAN_VALID.includes(req.body?.alasan) ? req.body.alasan : "lainnya";
    let foto;
    try { foto = normalisasiFoto(req.body?.foto, 4); } catch (e) { return res.status(400).json({ success: false, message: e.message }); }
    const [items] = await pool.query("SELECT product_name, subtotal FROM dashboard_order_items WHERE order_id = ? ORDER BY id", [pesanan.id]);
    const komplain = {
      id: `KMP-${pesanan.id}`,
      alasan,
      catatan: String(req.body?.catatan || "").slice(0, 500),
      foto,
      diajukanPada: new Date().toISOString(),
      status: "diajukan",
      items: items.map((i) => ({ komoditas: i.product_name, nilai: Number(i.subtotal) })),
    };
    const hasil = await terapkanUpdate(pesanan.kondisi, { status: "komplain", komplain }, req.user.id);
    res.status(hasil.code).json(hasil.body);
  } catch (e) {
    console.error("MOBILE KOMPLAIN ORDER:", e);
    res.status(500).json({ success: false, message: "Gagal mengajukan komplain." });
  }
}

// Pembeli memberi rating/ulasan setelah pesanan selesai (sekali per pesanan).
async function reviewMyOrder(req, res) {
  try {
    const k = kondisiId(req.params.id);
    const [rows] = await pool.query(`SELECT id, status FROM dashboard_orders WHERE ${k.sql} AND user_id = ? LIMIT 1`, [k.value, req.user.id]);
    if (!rows.length) return res.status(404).json({ success: false, message: "Pesanan tidak ditemukan." });
    if (rows[0].status !== "selesai") {
      return res.status(409).json({ success: false, message: "Ulasan hanya bisa diberikan setelah pesanan selesai." });
    }

    // Rating per komoditas (opsional). Nama komoditas harus ada di pesanan ini; yang lain diabaikan.
    const [items] = await pool.query("SELECT product_id, product_name FROM dashboard_order_items WHERE order_id = ?", [rows[0].id]);
    const dikenal = new Map(items.map((i) => [i.product_name, i.product_id]));
    const perItem = [];
    for (const r of Array.isArray(req.body?.itemRatings) ? req.body.itemRatings : []) {
      const nilai = Number(r?.rating);
      if (!dikenal.has(r?.komoditas) || !Number.isInteger(nilai) || nilai < 1 || nilai > 5) {
        return res.status(400).json({ success: false, message: "Rating per komoditas tidak valid." });
      }
      perItem.push({ productId: dikenal.get(r.komoditas), komoditas: r.komoditas, rating: nilai });
    }

    // Rating keseluruhan: dikirim klien, atau dibulatkan dari rata-rata rating per komoditas.
    let rating = Number(req.body?.rating);
    if ((req.body?.rating === undefined || req.body?.rating === null) && perItem.length) {
      rating = Math.round(perItem.reduce((s, r) => s + r.rating, 0) / perItem.length);
    }
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ success: false, message: "Rating harus bilangan bulat 1 sampai 5." });
    }

    let photos;
    try { photos = normalisasiFoto(req.body?.photos, 6); } catch (e) { return res.status(400).json({ success: false, message: e.message }); }

    const tags = Array.isArray(req.body?.tags) ? req.body.tags.map((t) => String(t).slice(0, 60)).slice(0, 10) : [];
    const liked = req.body?.courierLiked === undefined || req.body.courierLiked === null ? null : req.body.courierLiked ? 1 : 0;
    await pool.query(
      "INSERT INTO order_reviews (order_id, user_id, rating, tags, note, courier_liked, photos, item_ratings) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [rows[0].id, req.user.id, rating, JSON.stringify(tags), String(req.body?.note || "").slice(0, 1000) || null, liked, JSON.stringify(photos), JSON.stringify(perItem)]
    );
    res.status(201).json({ success: true, message: "Terima kasih atas ulasan Anda." });
  } catch (e) {
    if (e.code === "ER_DUP_ENTRY") return res.status(409).json({ success: false, message: "Pesanan ini sudah diulas." });
    console.error("MOBILE REVIEW ORDER:", e);
    res.status(500).json({ success: false, message: "Gagal menyimpan ulasan." });
  }
}

module.exports = { listMyOrders, createMyOrder, getMyOrder, cancelMyOrder, receiveMyOrder, komplainMyOrder, reviewMyOrder };

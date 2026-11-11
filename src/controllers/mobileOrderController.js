const { pool } = require("../config/database");
const { createOrder, restoreStock, terapkanUpdate, kondisiId } = require("./adminOrderController");

const ALASAN_VALID = ["tidak-segar", "tidak-sesuai-timbangan", "kemasan-rusak", "tidak-sesuai-pesanan", "lainnya"];

async function listMyOrders(req, res) {
  try {
    const [rows] = await pool.query(`
      SELECT id, order_code AS order_code, user_id, customer_name, address, rt_rw, patokan, drop_point, opsi_pengiriman,
        payment_method, phone, notes, status, total, kurir, komplain, tiba_di_pos_pada, created_at
      FROM dashboard_orders WHERE user_id = ? ORDER BY created_at DESC, id DESC
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
    await connection.query("UPDATE dashboard_orders SET status = 'dibatalkan' WHERE id = ?", [rows[0].id]);
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
    const [items] = await pool.query("SELECT product_name, subtotal FROM dashboard_order_items WHERE order_id = ? ORDER BY id", [pesanan.id]);
    const komplain = {
      id: `KMP-${pesanan.id}`,
      alasan,
      catatan: String(req.body?.catatan || "").slice(0, 500),
      foto: [],
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

module.exports = { listMyOrders, createMyOrder, getMyOrder, cancelMyOrder, receiveMyOrder, komplainMyOrder };

const { pool } = require("../config/database");
const { createOrder } = require("./adminOrderController");

async function listMyOrders(req, res) {
  try {
    const [rows] = await pool.query(`
      SELECT id, order_code AS order_code, user_id, customer_name, address, drop_point,
        payment_method, phone, notes, status, total, created_at
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
  req.body = { ...(req.body || {}), userId: req.user.id };
  return createOrder(req, res);
}

async function getMyOrder(req, res) {
  try {
    const [rows] = await pool.query("SELECT * FROM dashboard_orders WHERE id = ? AND user_id = ? LIMIT 1", [req.params.id, req.user.id]);
    if (!rows.length) return res.status(404).json({ success: false, message: "Pesanan tidak ditemukan." });
    const [items] = await pool.query("SELECT product_id, product_name, quantity, unit, unit_price AS price, subtotal, tag FROM dashboard_order_items WHERE order_id = ? ORDER BY id", [req.params.id]);
    res.json({ success: true, data: { order: rows[0], items } });
  } catch (e) { res.status(500).json({ success: false, message: "Gagal mengambil detail pesanan." }); }
}

async function cancelMyOrder(req, res) {
  try {
    const [result] = await pool.query("UPDATE dashboard_orders SET status = 'dibatalkan' WHERE id = ? AND user_id = ? AND status IN ('pending','perlu-dikemas')", [req.params.id, req.user.id]);
    if (!result.affectedRows) return res.status(400).json({ success: false, message: "Pesanan tidak ditemukan atau sudah diproses." });
    res.json({ success: true, message: "Pesanan dibatalkan." });
  } catch (e) { res.status(500).json({ success: false, message: "Gagal membatalkan pesanan." }); }
}

module.exports = { listMyOrders, createMyOrder, getMyOrder, cancelMyOrder };

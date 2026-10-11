const { pool } = require("../config/database");
const TYPES = new Set(["credit", "debit"]);
async function list(req, res) {
  try {
    const [rows] = await pool.query(`SELECT id, type, category, description, amount, reference_code AS referenceCode, created_at AS createdAt FROM dashboard_cash_transactions ORDER BY created_at DESC, id DESC`);
    res.json({ success: true, data: rows });
  } catch (e) { res.status(500).json({ success: false, message: "Gagal mengambil transaksi kas." }); }
}
async function create(req, res) {
  const { type, category, description, amount, referenceCode } = req.body || {};
  if (!TYPES.has(type) || !category || !description || !Number.isFinite(Number(amount)) || Number(amount) <= 0)
    return res.status(400).json({ success: false, message: "Jenis, kategori, deskripsi, dan nominal positif wajib diisi." });
  try {
    const [r] = await pool.query("INSERT INTO dashboard_cash_transactions (type, category, description, amount, reference_code) VALUES (?, ?, ?, ?, ?)", [type, category, description, Number(amount), referenceCode || null]);
    res.status(201).json({ success: true, data: { id: r.insertId, type, category, description, amount: Number(amount), referenceCode: referenceCode || null } });
  } catch (e) { res.status(500).json({ success: false, message: "Gagal menyimpan transaksi kas." }); }
}
async function update(req, res) {
  const { type, category, description, amount, referenceCode } = req.body || {};
  if (!TYPES.has(type) || !category || !description || !Number.isFinite(Number(amount)) || Number(amount) <= 0)
    return res.status(400).json({ success: false, message: "Data transaksi kas tidak valid." });
  try {
    const [r] = await pool.query("UPDATE dashboard_cash_transactions SET type=?, category=?, description=?, amount=?, reference_code=? WHERE id=?", [type, category, description, Number(amount), referenceCode || null, req.params.id]);
    if (!r.affectedRows) return res.status(404).json({ success: false, message: "Transaksi kas tidak ditemukan." });
    res.json({ success: true, message: "Transaksi kas diperbarui." });
  } catch (e) { res.status(500).json({ success: false, message: "Gagal memperbarui transaksi kas." }); }
}
async function remove(req, res) {
  try {
    const [r] = await pool.query("DELETE FROM dashboard_cash_transactions WHERE id=?", [req.params.id]);
    if (!r.affectedRows) return res.status(404).json({ success: false, message: "Transaksi kas tidak ditemukan." });
    res.json({ success: true, message: "Transaksi kas dihapus." });
  } catch (e) { res.status(500).json({ success: false, message: "Gagal menghapus transaksi kas." }); }
}
module.exports = { list, create, update, remove };

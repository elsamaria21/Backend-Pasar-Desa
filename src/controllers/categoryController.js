const { pool } = require("../config/database");
async function getCategories(req, res) {
  try {
    const [rows] = await pool.query("SELECT id, name, created_at FROM categories ORDER BY name ASC");
    res.json({ success: true, data: rows });
  } catch (e) { res.status(500).json({ success: false, message: "Gagal mengambil kategori." }); }
}
async function createCategory(req, res) {
  const name = String(req.body?.name || "").trim();
  if (!name) return res.status(400).json({ success: false, message: "Nama kategori wajib diisi." });
  try {
    const [r] = await pool.query("INSERT INTO categories (name) VALUES (?)", [name]);
    res.status(201).json({ success: true, message: "Kategori dibuat.", data: { id: r.insertId, name } });
  } catch (e) { res.status(500).json({ success: false, message: "Gagal membuat kategori." }); }
}
async function updateCategory(req, res) {
  const name = String(req.body?.name || "").trim();
  if (!name) return res.status(400).json({ success: false, message: "Nama kategori wajib diisi." });
  try {
    const [r] = await pool.query("UPDATE categories SET name=? WHERE id=?", [name, req.params.id]);
    if (!r.affectedRows) return res.status(404).json({ success: false, message: "Kategori tidak ditemukan." });
    res.json({ success: true, message: "Kategori diperbarui." });
  } catch (e) { res.status(500).json({ success: false, message: "Gagal memperbarui kategori." }); }
}
async function deleteCategory(req, res) {
  try {
    const [r] = await pool.query("DELETE FROM categories WHERE id=?", [req.params.id]);
    if (!r.affectedRows) return res.status(404).json({ success: false, message: "Kategori tidak ditemukan." });
    res.json({ success: true, message: "Kategori dihapus." });
  } catch (e) { res.status(500).json({ success: false, message: "Kategori tidak dapat dihapus karena masih digunakan." }); }
}
module.exports = { getCategories, createCategory, updateCategory, deleteCategory };

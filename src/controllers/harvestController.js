const { pool } = require("../config/database");
const QUALITIES = new Set(["baik", "sedang", "perlu-sortir"]);
function validate(body) {
  const namaPetani = String(body.namaPetani || body.farmer_name || "").trim();
  const namaTanaman = String(body.namaTanaman || body.crop_name || "").trim();
  const jumlah = Number(body.jumlah ?? body.quantity);
  const satuan = String(body.satuan || body.unit || "kg").trim();
  const kualitas = body.kualitas || body.quality || "baik";
  const tanggalPanen = body.tanggalPanen || body.harvest_date;
  const catatan = body.catatan ?? body.notes ?? null;
  if (!namaPetani || !namaTanaman || !Number.isFinite(jumlah) || jumlah <= 0 || !tanggalPanen)
    return { error: "Nama petani, tanaman, jumlah positif, dan tanggal panen wajib diisi." };
  if (!QUALITIES.has(kualitas)) return { error: "Kualitas harus baik, sedang, atau perlu-sortir." };
  if (namaPetani.length > 150 || namaTanaman.length > 150 || satuan.length > 30) return { error: "Nama atau satuan terlalu panjang." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(tanggalPanen)) || Number.isNaN(Date.parse(`${tanggalPanen}T00:00:00Z`))) return { error: "Tanggal panen harus berformat YYYY-MM-DD." };
  return { values: [namaPetani, namaTanaman, jumlah, satuan, kualitas, tanggalPanen, catatan] };
}
const SELECT = `SELECT id, farmer_name AS namaPetani, crop_name AS namaTanaman, quantity AS jumlah, unit AS satuan, quality AS kualitas, DATE_FORMAT(harvest_date, '%Y-%m-%d') AS tanggalPanen, notes AS catatan, created_at AS dibuatPada FROM harvest_results`;
async function listHarvests(req, res) {
  try {
    const { from, to, crop } = req.query;
    const conditions = [], values = [];
    if (from) { conditions.push("harvest_date >= ?"); values.push(from); }
    if (to) { conditions.push("harvest_date <= ?"); values.push(to); }
    if (crop) { conditions.push("crop_name LIKE ?"); values.push(`%${crop}%`); }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const [rows] = await pool.query(`${SELECT} ${where} ORDER BY harvest_date DESC, id DESC LIMIT 200`, values);
    res.json({ success: true, data: rows });
  } catch (e) { res.status(500).json({ success: false, message: "Gagal mengambil data hasil panen." }); }
}
async function createHarvest(req, res) {
  const parsed = validate(req.body || {});
  if (parsed.error) return res.status(400).json({ success: false, message: parsed.error });
  try {
    const [r] = await pool.query("INSERT INTO harvest_results (farmer_name,crop_name,quantity,unit,quality,harvest_date,notes) VALUES (?,?,?,?,?,?,?)", parsed.values);
    const [rows] = await pool.query(`${SELECT} WHERE id=?`, [r.insertId]);
    res.status(201).json({ success: true, message: "Hasil panen ditambahkan.", data: rows[0] });
  } catch (e) { res.status(500).json({ success: false, message: "Gagal menyimpan hasil panen." }); }
}
async function updateHarvest(req, res) {
  const parsed = validate(req.body || {});
  if (parsed.error) return res.status(400).json({ success: false, message: parsed.error });
  try {
    const [r] = await pool.query("UPDATE harvest_results SET farmer_name=?,crop_name=?,quantity=?,unit=?,quality=?,harvest_date=?,notes=? WHERE id=?", [...parsed.values, req.params.id]);
    if (!r.affectedRows) return res.status(404).json({ success: false, message: "Hasil panen tidak ditemukan." });
    const [rows] = await pool.query(`${SELECT} WHERE id=?`, [req.params.id]);
    res.json({ success: true, message: "Hasil panen diperbarui.", data: rows[0] });
  } catch (e) { res.status(500).json({ success: false, message: "Gagal memperbarui hasil panen." }); }
}
async function deleteHarvest(req, res) {
  try {
    const [r] = await pool.query("DELETE FROM harvest_results WHERE id=?", [req.params.id]);
    if (!r.affectedRows) return res.status(404).json({ success: false, message: "Hasil panen tidak ditemukan." });
    res.json({ success: true, message: "Hasil panen dihapus." });
  } catch (e) { res.status(500).json({ success: false, message: "Gagal menghapus hasil panen." }); }
}
module.exports = { listHarvests, createHarvest, updateHarvest, deleteHarvest };

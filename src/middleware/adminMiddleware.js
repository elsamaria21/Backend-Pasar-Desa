const { pool } = require("../config/database");

// Hanya untuk akun admin. Dipasang SETELAH authMiddleware.
// Role dibaca ulang dari database (bukan hanya dari token) supaya akun yang diturunkan
// dari admin langsung kehilangan akses, tanpa menunggu token kedaluwarsa.
async function adminMiddleware(req, res, next) {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ success: false, message: "Login diperlukan." });
    }

    const [rows] = await pool.query("SELECT role FROM users WHERE id = ? LIMIT 1", [req.user.id]);

    if (!rows.length || rows[0].role !== "admin") {
      return res.status(403).json({ success: false, message: "Akses khusus admin." });
    }

    req.user.role = "admin";
    next();
  } catch (error) {
    console.error("Admin middleware error:", error.message);
    return res.status(500).json({ success: false, message: "Gagal memeriksa hak akses." });
  }
}

module.exports = adminMiddleware;

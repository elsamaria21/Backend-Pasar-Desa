const crypto = require("crypto");
const { pool } = require("../config/database");
const { normalisasiFoto } = require("../utils/evidence");

// Pilihan "Kendala" dan "Solusi" sama dengan layar Buat Aduan di aplikasi mobile.
const TOPIK = ["Kualitas Produk / Layu", "Pengantaran / Kurir Desa", "Saldo Dompet & Refund", "Selisih Timbangan / Jumlah", "Masalah Akun / Lainnya"];
const SOLUSI = ["Kirim Ulang Barang Pengganti", "Pengembalian Saldo Dompet PasarDesa", "Koordinasi Langsung via WhatsApp Petugas"];
const STATUS = ["diverifikasi", "diproses", "selesai"];

const SELECT = `SELECT c.id, c.code AS kode, c.topik, c.order_code AS kodePesanan, c.judul, c.deskripsi, c.foto,
  c.solusi_diminta AS solusiDiminta, c.status, c.balasan, c.dibalas_pada AS dibalasPada, c.created_at AS dibuatPada,
  u.name AS pembeli, u.email, u.phone AS telepon
  FROM complaints c JOIN users u ON u.id = c.user_id`;

const kodeAduan = () => {
  const d = new Date();
  const tgl = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  return `ADU-${tgl}-${crypto.randomInt(1000, 9999)}`;
};

// ---------------------------------------------------------------- pembeli (mobile)
async function createComplaint(req, res) {
  try {
    const { topik, kodePesanan, judul, deskripsi, solusiDiminta } = req.body || {};
    if (!TOPIK.includes(topik)) return res.status(400).json({ success: false, message: "Kendala tidak valid." });
    if (!String(judul || "").trim()) return res.status(400).json({ success: false, message: "Judul aduan wajib diisi." });
    if (solusiDiminta && !SOLUSI.includes(solusiDiminta)) return res.status(400).json({ success: false, message: "Solusi yang diminta tidak valid." });

    let foto;
    try { foto = normalisasiFoto(req.body?.foto, 4); } catch (e) { return res.status(400).json({ success: false, message: e.message }); }

    if (kodePesanan) {
      const [pesanan] = await pool.query("SELECT id FROM dashboard_orders WHERE order_code = ? AND user_id = ? LIMIT 1", [kodePesanan, req.user.id]);
      if (!pesanan.length) return res.status(404).json({ success: false, message: "Pesanan terkait tidak ditemukan." });
    }

    for (let percobaan = 0; percobaan < 5; percobaan += 1) {
      const kode = kodeAduan();
      try {
        const [r] = await pool.query(
          "INSERT INTO complaints (code, user_id, topik, order_code, judul, deskripsi, foto, solusi_diminta) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
          [kode, req.user.id, topik, kodePesanan || null, String(judul).trim().slice(0, 150), String(deskripsi || "").slice(0, 1000) || null, JSON.stringify(foto), solusiDiminta || null]
        );
        return res.status(201).json({ success: true, message: "Tiket aduan terkirim.", data: { id: r.insertId, kode, status: "diverifikasi" } });
      } catch (e) {
        if (e.code !== "ER_DUP_ENTRY") throw e; // kode kembar: coba kode lain
      }
    }
    res.status(500).json({ success: false, message: "Gagal membuat nomor aduan, coba lagi." });
  } catch (e) {
    console.error("CREATE COMPLAINT:", e);
    res.status(500).json({ success: false, message: "Gagal mengirim aduan." });
  }
}

async function listMyComplaints(req, res) {
  try {
    const [rows] = await pool.query(`${SELECT} WHERE c.user_id = ? ORDER BY c.created_at DESC, c.id DESC`, [req.user.id]);
    res.json({ success: true, data: rows });
  } catch (e) {
    res.status(500).json({ success: false, message: "Gagal mengambil aduan." });
  }
}

// ---------------------------------------------------------------- admin (dashboard)
async function listComplaints(req, res) {
  try {
    const [rows] = await pool.query(`${SELECT} ORDER BY c.created_at DESC, c.id DESC LIMIT 500`);
    res.json({ success: true, data: rows });
  } catch (e) {
    console.error("ADMIN LIST COMPLAINTS:", e);
    res.status(500).json({ success: false, message: "Gagal mengambil aduan." });
  }
}

// Admin mengubah status (hanya maju: diverifikasi → diproses → selesai) dan/atau membalas pembeli.
async function updateComplaint(req, res) {
  try {
    const { status, balasan } = req.body || {};
    const sets = [];
    const values = [];
    const [ada] = await pool.query("SELECT status FROM complaints WHERE id = ? LIMIT 1", [req.params.id]);
    if (!ada.length) return res.status(404).json({ success: false, message: "Aduan tidak ditemukan." });

    if (status !== undefined) {
      if (!STATUS.includes(status)) return res.status(400).json({ success: false, message: "Status tidak valid." });
      if (STATUS.indexOf(status) < STATUS.indexOf(ada[0].status)) {
        return res.status(409).json({ success: false, message: "Status aduan tidak bisa mundur." });
      }
      sets.push("status = ?"); values.push(status);
    }
    if (balasan !== undefined) {
      const teks = String(balasan).trim().slice(0, 1000);
      if (!teks) return res.status(400).json({ success: false, message: "Balasan tidak boleh kosong." });
      sets.push("balasan = ?", "dibalas_pada = NOW()"); values.push(teks);
    }
    if (!sets.length) return res.status(400).json({ success: false, message: "Tidak ada perubahan yang dikirim." });

    await pool.query(`UPDATE complaints SET ${sets.join(", ")} WHERE id = ?`, [...values, req.params.id]);
    const [[terbaru]] = await pool.query(`${SELECT} WHERE c.id = ?`, [req.params.id]);
    res.json({ success: true, message: "Aduan diperbarui.", data: terbaru });
  } catch (e) {
    console.error("ADMIN UPDATE COMPLAINT:", e);
    res.status(500).json({ success: false, message: "Gagal memperbarui aduan." });
  }
}

module.exports = { createComplaint, listMyComplaints, listComplaints, updateComplaint, TOPIK, SOLUSI };

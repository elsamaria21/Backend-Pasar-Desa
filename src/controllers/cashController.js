const { pool } = require("../config/database");
const crypto = require("crypto");
const TYPES = new Set(["credit", "debit"]);
const MIN_TARIK = 50000; // sama dengan KAS_MIN_TARIK di frontend
const JALUR_TARIK = { bank: "Transfer Bank", tunai: "Tunai di Balai Desa" };
// Pesanan yang sudah dibayar tetapi belum selesai: dananya masih tertahan (escrow).
const STATUS_ESCROW = ["perlu-dikemas", "diproses", "siap-jemput", "sedang-dikemas", "dikirim", "diantar", "tiba-di-pos", "komplain"];

// Pengecekan saldo + penulisan debit harus satu kesatuan. Tanpa kunci, dua penarikan bersamaan bisa
// sama-sama lolos cek saldo. GET_LOCK memakai kunci tingkat aplikasi pada satu koneksi.
async function denganKunciKas(fn) {
  const connection = await pool.getConnection();
  try {
    const [[{ dapat }]] = await connection.query("SELECT GET_LOCK('pasardesa_kas', 5) AS dapat");
    if (!dapat) {
      const err = new Error("Sistem kas sedang sibuk, coba lagi sebentar.");
      err.status = 503;
      throw err;
    }
    try {
      return await fn(connection);
    } finally {
      await connection.query("SELECT RELEASE_LOCK('pasardesa_kas')");
    }
  } finally {
    connection.release();
  }
}

async function hitungSaldo(connection) {
  const [[row]] = await connection.query("SELECT COALESCE(SUM(CASE WHEN type = 'credit' THEN amount ELSE -amount END), 0) AS saldo FROM dashboard_cash_transactions");
  return Number(row.saldo);
}
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
    const data = await denganKunciKas(async (connection) => {
      if (type === "debit" && Number(amount) > (await hitungSaldo(connection))) {
        const err = new Error("Nominal melebihi saldo kas aktif.");
        err.status = 400;
        throw err;
      }
      const [r] = await connection.query("INSERT INTO dashboard_cash_transactions (type, category, description, amount, reference_code) VALUES (?, ?, ?, ?, ?)", [type, category, description, Number(amount), referenceCode || null]);
      return { id: r.insertId, type, category, description, amount: Number(amount), referenceCode: referenceCode || null };
    });
    res.status(201).json({ success: true, data });
  } catch (e) { res.status(e.status || 500).json({ success: false, message: e.status ? e.message : "Gagal menyimpan transaksi kas." }); }
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
// Ringkasan untuk kartu di halaman Kas & Saldo.
async function summary(req, res) {
  try {
    const [[kas]] = await pool.query(`
      SELECT
        COALESCE(SUM(CASE WHEN type = 'credit' THEN amount ELSE -amount END), 0) AS saldo,
        COALESCE(SUM(CASE WHEN category = 'penjualan' AND created_at >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
                          THEN (CASE WHEN type = 'credit' THEN amount ELSE -amount END) ELSE 0 END), 0) AS omsetBulanIni
      FROM dashboard_cash_transactions`);
    const [[escrow]] = await pool.query(
      "SELECT COUNT(*) AS jumlah, COALESCE(SUM(total), 0) AS total FROM dashboard_orders WHERE status IN (?)",
      [STATUS_ESCROW]
    );
    res.json({
      success: true,
      data: {
        saldoAktif: Number(kas.saldo),
        saldoTertahan: Number(escrow.total),
        pesananBerjalan: Number(escrow.jumlah),
        omsetBulanIni: Number(kas.omsetBulanIni),
      },
    });
  } catch (e) {
    console.error("CASH SUMMARY:", e);
    res.status(500).json({ success: false, message: "Gagal mengambil ringkasan kas." });
  }
}

// Penarikan saldo: nominal dibatasi saldo aktif, tercatat sebagai debit kategori "pencairan".
async function withdraw(req, res) {
  const nominal = Number(req.body?.nominal);
  const jalur = req.body?.jalur;

  if (!Number.isInteger(nominal) || nominal <= 0) return res.status(400).json({ success: false, message: "Nominal penarikan harus berupa bilangan bulat positif." });
  if (nominal < MIN_TARIK) return res.status(400).json({ success: false, message: `Minimal penarikan Rp ${MIN_TARIK.toLocaleString("id-ID")}.` });
  if (!JALUR_TARIK[jalur]) return res.status(400).json({ success: false, message: "Jalur pencairan harus bank atau tunai." });

  try {
    const data = await denganKunciKas(async (connection) => {
      const saldo = await hitungSaldo(connection);
      if (nominal > saldo) {
        const err = new Error(`Melebihi saldo aktif (maksimal Rp ${saldo.toLocaleString("id-ID")}).`);
        err.status = 400;
        throw err;
      }
      const referenceCode = `KAS-${Date.now()}-${crypto.randomInt(1000, 9999)}`;
      const [r] = await connection.query(
        "INSERT INTO dashboard_cash_transactions (type, category, description, amount, reference_code) VALUES ('debit', 'pencairan', ?, ?, ?)",
        [`Pencairan Dana Kas (${JALUR_TARIK[jalur]})`, nominal, referenceCode]
      );
      return { id: r.insertId, referenceCode, nominal, jalur, saldoSetelah: saldo - nominal };
    });
    res.status(201).json({ success: true, message: "Pengajuan pencairan tercatat.", data });
  } catch (e) {
    if (!e.status) console.error("CASH WITHDRAW:", e);
    res.status(e.status || 500).json({ success: false, message: e.status ? e.message : "Gagal memproses pencairan." });
  }
}

module.exports = { list, create, update, remove, summary, withdraw };

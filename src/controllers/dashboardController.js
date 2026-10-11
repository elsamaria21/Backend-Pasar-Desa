const { pool } = require("../config/database");

function rupiah(value) {
  return Number(value || 0);
}

// Data dashboard bersumber dari MySQL. Tidak ada angka contoh/fallback dummy.
async function getDashboard(req, res) {
  try {
    const [[productStats]] = await pool.query(`
      SELECT COUNT(*) AS total,
             SUM(CASE WHEN stock > 0 THEN 1 ELSE 0 END) AS aktif,
             SUM(CASE WHEN stock <= 5 THEN 1 ELSE 0 END) AS stok_kritis
      FROM products
    `);

    const [[orderStats]] = await pool.query(`
      SELECT COUNT(*) AS total,
             SUM(CASE WHEN status IN ('pending','perlu-dikemas','diproses') THEN 1 ELSE 0 END) AS perlu_dikemas,
             SUM(CASE WHEN status IN ('siap-jemput','dikirim') THEN 1 ELSE 0 END) AS berjalan,
             SUM(CASE WHEN status = 'selesai' THEN total ELSE 0 END) AS penjualan
      FROM dashboard_orders
    `);

    const [[cashStats]] = await pool.query(`
      SELECT
        COALESCE(SUM(CASE WHEN type = 'credit' THEN amount WHEN type = 'debit' THEN -amount ELSE 0 END), 0) AS saldo,
        COALESCE(SUM(CASE WHEN type = 'credit' AND category = 'penjualan' THEN amount ELSE 0 END), 0) AS omzet
      FROM dashboard_cash_transactions
    `);

    const [queue] = await pool.query(`
      SELECT o.id, o.order_code AS kode, o.customer_name AS pembeli,
             o.address AS alamat, o.drop_point AS dropPoint,
             o.payment_method AS metodeBayar, o.status,
             o.total, o.created_at AS dibuatPada
      FROM dashboard_orders o
      WHERE o.status <> 'selesai' AND o.status <> 'dibatalkan'
      ORDER BY o.created_at ASC
      LIMIT 8
    `);

    const [criticalStock] = await pool.query(`
      SELECT id, name AS nama, stock AS stok, price AS harga, image
      FROM products
      WHERE stock <= 5
      ORDER BY stock ASC, name ASC
      LIMIT 6
    `);

    const [categories] = await pool.query(`
      SELECT c.id, c.name AS nama, COUNT(p.id) AS jumlah
      FROM categories c LEFT JOIN products p ON p.category_id = c.id
      GROUP BY c.id, c.name ORDER BY c.name ASC
    `);

    const [dailySales] = await pool.query(`
      SELECT DATE_FORMAT(created_at, '%Y-%m-%d') AS tanggal,
             SUM(total) AS total
      FROM dashboard_orders
      WHERE status = 'selesai'
        AND created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
      GROUP BY DATE(created_at)
      ORDER BY DATE(created_at) ASC
    `);

    const [[harvestStats]] = await pool.query(`
      SELECT COUNT(*) AS jumlahPanen,
             COUNT(DISTINCT crop_name) AS jenisTanaman
      FROM harvest_results
      WHERE harvest_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
    `);

    const [harvestResults] = await pool.query(`
      SELECT id, farmer_name AS namaPetani, crop_name AS namaTanaman,
             quantity AS jumlah, unit AS satuan, quality AS kualitas,
             harvest_date AS tanggalPanen, notes AS catatan
      FROM harvest_results
      ORDER BY harvest_date DESC, id DESC
      LIMIT 8
    `);

    const [news] = await pool.query(`
      SELECT id, label, title AS judul, body AS isi, published_at AS tanggal
      FROM dashboard_news
      WHERE is_published = 1
      ORDER BY published_at DESC
      LIMIT 4
    `);

    const [logistics] = await pool.query(`
      SELECT courier_name AS nama, vehicle AS armada, route AS rute,
             estimated_arrival AS estimasi, phone AS telepon, status
      FROM dashboard_couriers
      WHERE is_active = 1
      ORDER BY id DESC LIMIT 1
    `);

    return res.json({
      success: true,
      data: {
        stats: {
          totalKomoditas: Number(productStats.total || 0),
          komoditasAktif: Number(productStats.aktif || 0),
          stokKritis: Number(productStats.stok_kritis || 0),
          totalPesanan: Number(orderStats.total || 0),
          perluDikemas: Number(orderStats.perlu_dikemas || 0),
          pesananBerjalan: Number(orderStats.berjalan || 0),
          penjualan: rupiah(orderStats.penjualan),
          saldoKas: rupiah(cashStats.saldo),
          omzet: rupiah(cashStats.omzet),
          jumlahPanen30Hari: Number(harvestStats.jumlahPanen || 0),
          jenisTanamanDipanen30Hari: Number(harvestStats.jenisTanaman || 0),
        },
        antreanPesanan: queue,
        stokKritis: criticalStock,
        kategori: categories,
        trenPenjualan: dailySales,
        kurirAktif: logistics[0] || null,
        hasilPanen: harvestResults,
        warta: news,
      },
    });
  } catch (error) {
    console.error("GET DASHBOARD ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Gagal mengambil data dashboard. Pastikan migrasi database dashboard sudah dijalankan.",
    });
  }
}

async function getMobileDashboard(req, res) {
  return getDashboard(req, res);
}

module.exports = { getDashboard, getMobileDashboard };

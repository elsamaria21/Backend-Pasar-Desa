const { pool } = require("../config/database");

const bacaJson = (nilai, awal) => {
  if (nilai === null || nilai === undefined) return awal;
  if (typeof nilai !== "string") return nilai;
  try { return JSON.parse(nilai); } catch { return awal; }
};

// Ulasan & rating pembeli untuk dashboard admin: ringkasan, sebaran bintang, rata-rata per komoditas, dan daftar ulasan.
// Rating per komoditas dipakai bila pembeli memberinya; bila tidak, rating pesanan berlaku untuk semua item pesanan itu.
async function listReviews(req, res) {
  try {
    const [rows] = await pool.query(`
      SELECT r.id, r.rating, r.tags, r.note, r.courier_liked AS courierLiked, r.photos, r.item_ratings AS itemRatings,
        r.created_at AS dibuatPada, o.id AS orderId, o.order_code AS kode, o.customer_name AS pembeli
      FROM order_reviews r JOIN dashboard_orders o ON o.id = r.order_id
      ORDER BY r.created_at DESC, r.id DESC LIMIT 1000
    `);

    const itemPerPesanan = new Map();
    if (rows.length) {
      const [items] = await pool.query(
        "SELECT order_id AS orderId, product_id AS productId, product_name AS komoditas FROM dashboard_order_items WHERE order_id IN (?) ORDER BY id",
        [rows.map((r) => r.orderId)]
      );
      for (const i of items) {
        if (!itemPerPesanan.has(i.orderId)) itemPerPesanan.set(i.orderId, []);
        itemPerPesanan.get(i.orderId).push(i);
      }
    }

    const distribusi = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    const produk = new Map();
    let jumlahTotal = 0;
    let denganFoto = 0;

    const ulasan = rows.map(({ orderId, courierLiked, photos, itemRatings, ...r }) => {
      const foto = bacaJson(photos, []);
      const perItem = bacaJson(itemRatings, []);
      const items = itemPerPesanan.get(orderId) || [];
      // Rating tiap komoditas pada ulasan ini: milik sendiri bila ada, kalau tidak ikut rating pesanan.
      const nilaiItem = items.map((i) => ({ komoditas: i.komoditas, rating: perItem.find((p) => p.komoditas === i.komoditas)?.rating ?? r.rating, productId: i.productId }));

      distribusi[r.rating] = (distribusi[r.rating] || 0) + 1;
      jumlahTotal += r.rating;
      if (foto.length) denganFoto += 1;
      for (const n of nilaiItem) {
        const acuan = produk.get(n.komoditas) || { productId: n.productId, nama: n.komoditas, jumlah: 0, total: 0, denganFoto: 0 };
        acuan.jumlah += 1;
        acuan.total += n.rating;
        if (foto.length) acuan.denganFoto += 1;
        produk.set(n.komoditas, acuan);
      }

      return { ...r, courierLiked: courierLiked === null ? null : Boolean(courierLiked), foto, items: nilaiItem.map(({ komoditas, rating }) => ({ komoditas, rating })) };
    });

    res.json({
      success: true,
      data: {
        ringkasan: { total: ulasan.length, rataRata: ulasan.length ? Math.round((jumlahTotal / ulasan.length) * 100) / 100 : 0, denganFoto, distribusi },
        perProduk: [...produk.values()]
          .map((p) => ({ productId: p.productId, nama: p.nama, rataRata: Math.round((p.total / p.jumlah) * 10) / 10, jumlah: p.jumlah, denganFoto: p.denganFoto }))
          .sort((a, b) => b.rataRata - a.rataRata || b.jumlah - a.jumlah),
        ulasan,
      },
    });
  } catch (e) {
    console.error("ADMIN LIST REVIEWS:", e);
    res.status(500).json({ success: false, message: "Gagal mengambil ulasan." });
  }
}

module.exports = { listReviews };

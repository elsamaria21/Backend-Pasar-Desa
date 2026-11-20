const { pool } = require("../config/database");
const midtrans = require("../services/midtransService");
const { restoreStock, kondisiId } = require("./adminOrderController");

// Catatan audit setiap notifikasi/sinkronisasi (gagal mencatat tidak boleh menggagalkan pembayaran).
async function catat(db, orderCode, data, sumber, hasil) {
  try {
    await db.query(
      `INSERT INTO payment_notifications
        (order_code, midtrans_transaction_id, transaction_status, fraud_status, status_code, gross_amount, payment_type, sumber, hasil, raw)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [orderCode, data.transaction_id || null, data.transaction_status || null, data.fraud_status || null, data.status_code || null,
        data.gross_amount ?? null, data.payment_type || null, sumber, hasil, JSON.stringify(data)]
    );
  } catch (e) {
    console.error("CATAT NOTIFIKASI:", e.message);
  }
}

// Satu-satunya tempat status pembayaran berubah. Dipakai webhook, sinkronisasi dari aplikasi, dan sweeper.
// Idempoten: notifikasi yang sama dikirim berkali-kali tidak menggandakan efek.
async function terapkanStatusPembayaran(orderCode, data, sumber = "webhook") {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query(
      "SELECT id, status, total + biaya_kirim - diskon AS total_bayar, payment_status FROM dashboard_orders WHERE order_code = ? FOR UPDATE",
      [orderCode]
    );
    if (!rows.length) {
      await connection.rollback();
      return { ditemukan: false, hasil: "pesanan-tidak-ditemukan" };
    }
    const o = rows[0];

    // Nominal dari Midtrans harus sama dengan total pesanan di server; selisih berarti ada yang tidak beres.
    if (data.gross_amount !== undefined && Math.round(Number(data.gross_amount)) !== Math.round(Number(o.total_bayar))) {
      console.error(`PAYMENT: nominal tidak cocok untuk ${orderCode}: midtrans=${data.gross_amount} server=${o.total_bayar}`);
      await catat(connection, orderCode, data, sumber, "nominal-tidak-cocok");
      await connection.commit();
      return { ditemukan: true, hasil: "nominal-tidak-cocok" };
    }

    const baru = midtrans.petakanStatus(data);
    const jenis = data.payment_type || null;
    const kanal = midtrans.kanalDariNotifikasi(data);
    const trx = data.transaction_id || null;
    let hasil;

    if (baru === "lunas") {
      if (o.payment_status === "lunas") {
        hasil = "sudah-lunas";
      } else if (o.status === "pending") {
        await connection.query(
          "UPDATE dashboard_orders SET payment_status = 'lunas', status = 'perlu-dikemas', paid_at = NOW(), payment_type = ?, payment_channel = ?, midtrans_transaction_id = ? WHERE id = ?",
          [jenis, kanal, trx, o.id]
        );
        hasil = "lunas-lanjut-dikemas";
      } else {
        // Dibayar setelah pesanan dibatalkan/kedaluwarsa: dana masuk tetapi pesanan tidak jalan → perlu refund manual.
        await connection.query(
          "UPDATE dashboard_orders SET payment_status = 'lunas', paid_at = NOW(), payment_type = ?, payment_channel = ?, midtrans_transaction_id = ? WHERE id = ?",
          [jenis, kanal, trx, o.id]
        );
        hasil = `lunas-tapi-pesanan-${o.status}-perlu-refund`;
        console.warn(`PAYMENT: ${orderCode} dibayar saat status pesanan "${o.status}". Refund manual diperlukan.`);
      }
    } else if (baru === "dikembalikan") {
      await connection.query("UPDATE dashboard_orders SET payment_status = 'dikembalikan' WHERE id = ?", [o.id]);
      hasil = "dikembalikan";
    } else if (o.payment_status === "lunas") {
      // Notifikasi lama/terlambat (mis. "pending" tiba setelah "settlement") tidak boleh menurunkan status lunas.
      hasil = "abaikan-penurunan-status";
    } else if (baru === "gagal" || baru === "kedaluwarsa") {
      await connection.query("UPDATE dashboard_orders SET payment_status = ?, payment_type = COALESCE(?, payment_type) WHERE id = ?", [baru, jenis, o.id]);
      if (o.status === "pending") {
        const alasan = baru === "kedaluwarsa" ? "Waktu pembayaran habis." : "Pembayaran gagal atau dibatalkan.";
        await connection.query(
          "UPDATE dashboard_orders SET status = 'dibatalkan', dibatalkan_oleh = 'sistem', alasan_batal = ?, dibatalkan_pada = NOW() WHERE id = ?",
          [alasan, o.id]
        );
        await restoreStock(connection, o.id);
        hasil = `${baru}-pesanan-dibatalkan`;
      } else {
        hasil = baru;
      }
    } else {
      await connection.query(
        "UPDATE dashboard_orders SET payment_status = 'menunggu', payment_type = COALESCE(?, payment_type), payment_channel = COALESCE(?, payment_channel), midtrans_transaction_id = COALESCE(?, midtrans_transaction_id) WHERE id = ?",
        [jenis, kanal, trx, o.id]
      );
      hasil = "menunggu";
    }

    await catat(connection, orderCode, data, sumber, hasil);
    await connection.commit();
    return { ditemukan: true, hasil };
  } catch (e) {
    await connection.rollback();
    throw e;
  } finally {
    connection.release();
  }
}

const galatKonfigurasi = (e) => /MIDTRANS_SERVER_KEY|Server Key/.test(e.message || "");

// POST /api/payments/midtrans/snap  { orderId | orderCode }
// Membuat (atau mengembalikan yang sudah ada) tagihan Snap untuk pesanan milik pembeli yang sedang login.
async function buatTagihan(req, res) {
  try {
    const ref = req.body?.orderId ?? req.body?.orderCode ?? req.body?.kode;
    if (!ref) return res.status(400).json({ success: false, message: "orderId wajib diisi." });
    const k = kondisiId(ref);
    const baca = async () => {
      const [rows] = await pool.query(
        `SELECT id, order_code, customer_name, phone, total, biaya_kirim, diskon, total + biaya_kirim - diskon AS total_bayar, status, payment_status, midtrans_token, midtrans_redirect_url,
                TIMESTAMPDIFF(SECOND, NOW(), payment_expires_at) AS sisa_detik
         FROM dashboard_orders WHERE ${k.sql} AND user_id = ? LIMIT 1`,
        [k.value, req.user.id]
      );
      return rows[0];
    };
    const o = await baca();
    if (!o) return res.status(404).json({ success: false, message: "Pesanan tidak ditemukan." });
    if (o.payment_status === "lunas") return res.status(409).json({ success: false, message: "Pesanan ini sudah dibayar." });
    if (o.status !== "pending" || o.payment_status !== "menunggu") {
      return res.status(409).json({ success: false, message: "Pesanan ini tidak sedang menunggu pembayaran." });
    }
    if (o.sisa_detik === null || o.sisa_detik <= 30) {
      return res.status(409).json({ success: false, message: "Waktu pembayaran sudah habis. Silakan buat pesanan baru." });
    }

    const jawab = (row) => res.json({
      success: true,
      data: {
        orderId: row.id,
        orderCode: row.order_code,
        token: row.midtrans_token,
        redirectUrl: row.midtrans_redirect_url,
        expiresInSeconds: row.sisa_detik,
        clientKey: process.env.MIDTRANS_CLIENT_KEY || null,
      },
    });
    if (o.midtrans_token) return jawab(o); // tagihan sudah ada (mis. aplikasi dibuka ulang)

    const [items] = await pool.query(
      "SELECT product_id, product_name, quantity, unit, subtotal FROM dashboard_order_items WHERE order_id = ? ORDER BY id",
      [o.id]
    );
    const { itemDetails, grossAmount } = midtrans.buatItemDetails(items, o.total_bayar, { biayaKirim: o.biaya_kirim, diskon: o.diskon });
    if (grossAmount < 1) return res.status(400).json({ success: false, message: "Total pesanan tidak valid." });

    const base = (process.env.PUBLIC_BASE_URL || "").replace(/\/$/, "");
    let snap;
    try {
      snap = await midtrans.buatSnap({
        orderId: o.order_code,
        grossAmount,
        itemDetails,
        pembeli: o.customer_name,
        telepon: o.phone,
        menitKedaluwarsa: Math.ceil(o.sisa_detik / 60),
        urlSelesai: base ? `${base}/api/payments/midtrans/finish` : undefined,
      });
    } catch (e) {
      // Permintaan ganda bersamaan: yang kedua ditolak Midtrans (order_id terpakai) → pakai tagihan yang sudah tersimpan.
      const ulang = await baca();
      if (ulang?.midtrans_token) return jawab(ulang);
      throw e;
    }

    await pool.query("UPDATE dashboard_orders SET midtrans_token = ?, midtrans_redirect_url = ? WHERE id = ?", [snap.token, snap.redirect_url, o.id]);
    return jawab({ ...o, midtrans_token: snap.token, midtrans_redirect_url: snap.redirect_url });
  } catch (e) {
    console.error("MIDTRANS SNAP:", e);
    if (galatKonfigurasi(e)) return res.status(503).json({ success: false, message: "Pembayaran online belum dikonfigurasi di server." });
    if (e.code === "MIDTRANS_UNREACHABLE") return res.status(502).json({ success: false, message: "Layanan pembayaran tidak dapat dihubungi. Coba lagi." });
    res.status(500).json({ success: false, message: e.message || "Gagal membuat tagihan pembayaran." });
  }
}

// POST /api/payments/midtrans/notification — dipanggil server Midtrans (tanpa token login; dilindungi signature).
async function notifikasi(req, res) {
  try {
    const n = req.body || {};
    if (!midtrans.signatureValid(n)) return res.status(403).json({ success: false, message: "Signature tidak valid." });

    // Status dikonfirmasi ulang ke Midtrans agar tidak bergantung pada isi notifikasi saja. Bila gagal, pakai notifikasi
    // (signature-nya sudah terverifikasi).
    let data = n;
    try {
      const resmi = await midtrans.cekStatus(n.order_id);
      if (resmi?.transaction_status && resmi.order_id === n.order_id) data = resmi;
    } catch (e) {
      console.warn("MIDTRANS: konfirmasi status gagal, memakai isi notifikasi:", e.message);
    }

    const hasil = await terapkanStatusPembayaran(n.order_id, data, "webhook");
    // Selalu 200 untuk notifikasi sah (termasuk order tak dikenal / uji coba dashboard Midtrans) agar tidak diulang terus.
    res.json({ success: true, hasil: hasil.hasil });
  } catch (e) {
    console.error("MIDTRANS NOTIFIKASI:", e);
    res.status(500).json({ success: false, message: "Gagal memproses notifikasi." }); // 5xx → Midtrans mencoba lagi
  }
}

// GET /api/payments/midtrans/status/:id — aplikasi menanyakan status; server menyinkronkannya dengan Midtrans lebih dulu.
// Ini juga jalan keluar saat webhook belum sampai (mis. server lokal tanpa URL publik).
async function statusPembayaran(req, res) {
  try {
    const k = kondisiId(req.params.id);
    const baca = async () => {
      const [rows] = await pool.query(
        `SELECT id, order_code, status, payment_status, payment_type, payment_channel, paid_at, midtrans_token,
                TIMESTAMPDIFF(SECOND, NOW(), payment_expires_at) AS sisa_detik
         FROM dashboard_orders WHERE ${k.sql} AND user_id = ? LIMIT 1`,
        [k.value, req.user.id]
      );
      return rows[0];
    };
    let o = await baca();
    if (!o) return res.status(404).json({ success: false, message: "Pesanan tidak ditemukan." });

    if (o.payment_status === "menunggu" && o.midtrans_token) {
      try {
        const data = await midtrans.cekStatus(o.order_code);
        if (data?.transaction_status) {
          await terapkanStatusPembayaran(o.order_code, data, "sinkron");
          o = await baca();
        }
      } catch (e) {
        console.warn("MIDTRANS: sinkron status gagal:", e.message); // tampilkan status terakhir yang diketahui server
      }
    }

    res.json({
      success: true,
      data: {
        orderCode: o.order_code,
        orderStatus: o.status,
        paymentStatus: o.payment_status,
        paymentType: o.payment_type,
        paymentChannel: o.payment_channel,
        paidAt: o.paid_at,
        expiresInSeconds: o.payment_status === "menunggu" ? Math.max(0, o.sisa_detik ?? 0) : 0,
      },
    });
  } catch (e) {
    console.error("MIDTRANS STATUS:", e);
    res.status(500).json({ success: false, message: "Gagal memeriksa status pembayaran." });
  }
}

// Halaman tujuan setelah Snap selesai. Aplikasi mendeteksi URL ini di WebView lalu menutupnya.
const halaman = (judul, pesan) =>
  `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${judul}</title>` +
  `<style>body{font-family:system-ui,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;background:#f8fffb;color:#14201a}` +
  `main{text-align:center;padding:24px}h1{font-size:18px}p{font-size:14px;color:#3b4a42}</style></head>` +
  `<body><main><h1>${judul}</h1><p>${pesan}</p></main></body></html>`;

const selesai = (req, res) => res.type("html").send(halaman("Pembayaran diproses", "Kembali ke aplikasi PasarDesa untuk melihat status pesanan Anda."));
const belumSelesai = (req, res) => res.type("html").send(halaman("Pembayaran belum selesai", "Kembali ke aplikasi PasarDesa untuk melanjutkan atau membatalkan."));
const galat = (req, res) => res.type("html").send(halaman("Pembayaran gagal", "Kembali ke aplikasi PasarDesa dan coba lagi."));

// Pesanan menunggu bayar yang melewati batas waktu: pastikan ke Midtrans dulu (bisa saja sudah dibayar), baru dibatalkan.
// Bila Midtrans tidak terjangkau, pesanan dibiarkan dan dicoba lagi pada putaran berikutnya.
async function sapuPesananKedaluwarsa() {
  const [rows] = await pool.query(
    `SELECT order_code FROM dashboard_orders
     WHERE status = 'pending' AND payment_status = 'menunggu' AND payment_expires_at IS NOT NULL
       AND payment_expires_at < NOW() - INTERVAL 1 MINUTE
     ORDER BY payment_expires_at LIMIT 50`
  );
  for (const { order_code: kode } of rows) {
    try {
      let data = await midtrans.cekStatus(kode);
      if (data.transaction_status === "pending") {
        await midtrans.kedaluwarsakan(kode);
        data = await midtrans.cekStatus(kode);
      }
      // Tidak ada transaksi di Midtrans (pembeli tak pernah membuka Snap) → dianggap kedaluwarsa.
      const efektif = data.transaction_status ? data : { order_id: kode, transaction_status: "expire" };
      await terapkanStatusPembayaran(kode, efektif, "sweeper");
    } catch (e) {
      console.warn(`SWEEPER ${kode}:`, e.message);
    }
  }
  return rows.length;
}

let timerSweeper = null;
function jalankanSweeper() {
  if (timerSweeper || !process.env.MIDTRANS_SERVER_KEY) return;
  let berjalan = false;
  timerSweeper = setInterval(async () => {
    if (berjalan) return;
    berjalan = true;
    try { await sapuPesananKedaluwarsa(); } catch (e) { console.error("SWEEPER:", e.message); } finally { berjalan = false; }
  }, 60_000);
  timerSweeper.unref();
}

module.exports = { buatTagihan, notifikasi, statusPembayaran, selesai, belumSelesai, galat, terapkanStatusPembayaran, sapuPesananKedaluwarsa, jalankanSweeper };

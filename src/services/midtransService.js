const crypto = require("crypto");

// Klien Midtrans tanpa dependensi tambahan (memakai fetch bawaan Node >= 18).
// Server Key hanya ada di server ini; aplikasi mobile/dashboard tidak pernah memegangnya.

const produksi = () => String(process.env.MIDTRANS_IS_PRODUCTION || "").toLowerCase() === "true";
const SNAP_URL = () => (produksi() ? "https://app.midtrans.com/snap/v1/transactions" : "https://app.sandbox.midtrans.com/snap/v1/transactions");
const API_URL = () => (produksi() ? "https://api.midtrans.com/v2" : "https://api.sandbox.midtrans.com/v2");

function serverKey() {
  const key = process.env.MIDTRANS_SERVER_KEY;
  if (!key) throw new Error("MIDTRANS_SERVER_KEY belum diisi di .env.");
  // Guard sederhana: kunci sandbox ("SB-Mid-server-...") tidak boleh dipakai di mode produksi dan sebaliknya.
  const sandbox = key.startsWith("SB-");
  if (produksi() && sandbox) throw new Error("MIDTRANS_IS_PRODUCTION=true tetapi Server Key adalah kunci sandbox.");
  if (!produksi() && !sandbox) throw new Error("Server Key produksi terdeteksi saat MIDTRANS_IS_PRODUCTION bukan true.");
  return key;
}

const authHeader = () => `Basic ${Buffer.from(`${serverKey()}:`).toString("base64")}`;

async function panggil(method, url, body) {
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: authHeader() },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
    });
  } catch (e) {
    const err = new Error("Midtrans tidak dapat dihubungi.");
    err.cause = e;
    err.code = "MIDTRANS_UNREACHABLE";
    throw err;
  }
  const data = await res.json().catch(() => ({}));
  return { httpStatus: res.status, data };
}

// Membuat transaksi Snap. Mengembalikan { token, redirect_url }.
async function buatSnap({ orderId, grossAmount, itemDetails, pembeli, telepon, menitKedaluwarsa, urlSelesai }) {
  const body = {
    transaction_details: { order_id: orderId, gross_amount: grossAmount },
    item_details: itemDetails,
    customer_details: { first_name: String(pembeli || "Pembeli").slice(0, 255), ...(telepon ? { phone: String(telepon).slice(0, 19) } : {}) },
    expiry: { unit: "minute", duration: Math.max(1, Math.floor(menitKedaluwarsa)) },
    ...(urlSelesai ? { callbacks: { finish: urlSelesai } } : {}),
  };
  const { httpStatus, data } = await panggil("POST", SNAP_URL(), body);
  if (httpStatus >= 400 || !data.token) {
    const err = new Error(data.error_messages?.join(" ") || data.status_message || "Gagal membuat tagihan Midtrans.");
    err.code = "MIDTRANS_SNAP_ERROR";
    throw err;
  }
  return { token: data.token, redirect_url: data.redirect_url };
}

// Status transaksi dari sumber resmi. Midtrans membalas HTTP 200 dengan status_code "404" bila transaksi belum ada.
async function cekStatus(orderId) {
  const { data } = await panggil("GET", `${API_URL()}/${encodeURIComponent(orderId)}/status`);
  return data;
}

async function batalkan(orderId) {
  const { data } = await panggil("POST", `${API_URL()}/${encodeURIComponent(orderId)}/cancel`);
  return data;
}

async function kedaluwarsakan(orderId) {
  const { data } = await panggil("POST", `${API_URL()}/${encodeURIComponent(orderId)}/expire`);
  return data;
}

// Signature notifikasi = SHA512(order_id + status_code + gross_amount + ServerKey). Dibandingkan secara constant-time.
function signatureValid(n) {
  if (!n || !n.order_id || !n.status_code || n.gross_amount === undefined || !n.signature_key) return false;
  const harapan = crypto.createHash("sha512").update(`${n.order_id}${n.status_code}${n.gross_amount}${serverKey()}`).digest("hex");
  const a = Buffer.from(harapan);
  const b = Buffer.from(String(n.signature_key));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Status Midtrans → status pembayaran internal (kolom payment_status).
// capture hanya kartu kredit; "challenge" berarti menunggu review fraud, belum boleh dianggap lunas.
function petakanStatus(n) {
  const s = n.transaction_status;
  const fraud = n.fraud_status;
  if (s === "settlement") return "lunas";
  if (s === "capture") return fraud === "challenge" ? "menunggu" : "lunas";
  if (s === "pending" || s === "authorize") return "menunggu";
  if (s === "expire") return "kedaluwarsa";
  if (s === "deny" || s === "cancel" || s === "failure") return "gagal";
  if (s === "refund" || s === "partial_refund" || s === "chargeback" || s === "partial_chargeback") return "dikembalikan";
  return "menunggu";
}

// Kanal pembayaran yang ramah dibaca: bank VA, "echannel" (Mandiri), atau acquirer e-wallet/QRIS.
function kanalDariNotifikasi(n) {
  if (Array.isArray(n.va_numbers) && n.va_numbers[0]?.bank) return n.va_numbers[0].bank;
  if (n.permata_va_number) return "permata";
  if (n.biller_code) return "mandiri";
  return n.acquirer || n.issuer || n.bank || null;
}

// Rincian item untuk Snap. Midtrans hanya menerima quantity bilangan bulat, sedangkan stok komoditas bisa pecahan (kg),
// jadi tiap baris dikirim quantity 1 dengan harga = subtotal. Jumlah harus persis sama dengan gross_amount.
function buatItemDetails(items, totalBayar, { biayaKirim = 0, diskon = 0 } = {}) {
  const gross = Math.round(Number(totalBayar));
  const baris = items.map((i, idx) => ({
    id: String(i.product_id ?? `ITEM-${idx + 1}`).slice(0, 50),
    price: Math.round(Number(i.subtotal)),
    quantity: 1,
    name: `${i.product_name} (${Number(i.quantity)} ${i.unit || ""})`.trim().slice(0, 50),
  }));
  if (Number(biayaKirim) > 0) baris.push({ id: "ONGKIR", price: Math.round(Number(biayaKirim)), quantity: 1, name: "Ongkos kirim kurir desa" });
  if (Number(diskon) > 0) baris.push({ id: "VOUCHER", price: -Math.round(Number(diskon)), quantity: 1, name: "Voucher gratis ongkir" });
  const jumlah = baris.reduce((s, b) => s + b.price, 0);
  if (jumlah !== gross) baris.push({ id: "PENYESUAIAN", price: gross - jumlah, quantity: 1, name: "Penyesuaian pembulatan" });
  return { itemDetails: baris, grossAmount: gross };
}

module.exports = { buatSnap, cekStatus, batalkan, kedaluwarsakan, signatureValid, petakanStatus, kanalDariNotifikasi, buatItemDetails };

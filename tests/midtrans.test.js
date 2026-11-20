// Uji logika pembayaran tanpa MySQL/jaringan: `node --test tests/midtrans.test.js`
const test = require("node:test");
const assert = require("node:assert");
const crypto = require("crypto");
const Module = require("module");

process.env.MIDTRANS_SERVER_KEY = "SB-Mid-server-TESTKEY";
process.env.MIDTRANS_IS_PRODUCTION = "false";

// ---- DB palsin: menyimpan baris pesanan di memori dan mengenali query yang dipakai kode ----
const db = { order: null, queries: [], notif: [], stokDikembalikan: 0 };
function jalankan(sql, params = []) {
  db.queries.push({ sql, params });
  const s = sql.replace(/\s+/g, " ").trim();
  if (s.startsWith("SELECT id, status, total + biaya_kirim - diskon AS total_bayar, payment_status FROM dashboard_orders WHERE order_code")) return [db.order ? [{ ...db.order }] : []];
  if (s.startsWith("UPDATE dashboard_orders SET payment_status = 'lunas', status = 'perlu-dikemas'")) { Object.assign(db.order, { payment_status: "lunas", status: "perlu-dikemas" }); return [{}]; }
  if (s.startsWith("UPDATE dashboard_orders SET payment_status = 'lunas'")) { db.order.payment_status = "lunas"; return [{}]; }
  if (s.startsWith("UPDATE dashboard_orders SET payment_status = ?, payment_type")) { db.order.payment_status = params[0]; return [{}]; }
  if (s.startsWith("UPDATE dashboard_orders SET status = 'dibatalkan'")) { db.order.status = "dibatalkan"; return [{}]; }
  if (s.startsWith("UPDATE dashboard_orders SET payment_status = 'menunggu'")) { db.order.payment_status = "menunggu"; return [{}]; }
  if (s.startsWith("UPDATE dashboard_orders SET payment_status = 'dikembalikan'")) { db.order.payment_status = "dikembalikan"; return [{}]; }
  if (s.startsWith("INSERT INTO payment_notifications")) { db.notif.push(params); return [{}]; }
  if (s.startsWith("SELECT product_id, quantity FROM dashboard_order_items")) return [[{ product_id: 1, quantity: 2 }]];
  if (s.startsWith("UPDATE products SET stock = stock + ?")) { db.stokDikembalikan += params[0]; return [{}]; }
  throw new Error("Query tak dikenali di tes: " + s.slice(0, 80));
}
const koneksi = { query: async (s, p) => jalankan(s, p), beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release: () => {} };
const fakeDb = { pool: { ...koneksi, getConnection: async () => koneksi } };

const asalLoad = Module._load;
Module._load = function (req, parent, ...r) {
  if (req.endsWith("config/database")) return fakeDb;
  return asalLoad.call(this, req, parent, ...r);
};

const svc = require("../src/services/midtransService");
const pay = require("../src/controllers/paymentController");

const sig = (n) => crypto.createHash("sha512").update(`${n.order_id}${n.status_code}${n.gross_amount}${process.env.MIDTRANS_SERVER_KEY}`).digest("hex");
const reset = (o) => { db.order = { id: 7, status: "pending", total_bayar: "45500.00", payment_status: "menunggu", ...o }; db.notif = []; db.stokDikembalikan = 0; };

test("signature: valid, dan ditolak bila nominal/kunci diubah", () => {
  const n = { order_id: "PSD-1-1234", status_code: "200", gross_amount: "45500.00" };
  n.signature_key = sig(n);
  assert.equal(svc.signatureValid(n), true);
  assert.equal(svc.signatureValid({ ...n, gross_amount: "1.00" }), false);
  assert.equal(svc.signatureValid({ ...n, signature_key: "x" }), false);
  assert.equal(svc.signatureValid({}), false);
});

test("kunci produksi di mode sandbox ditolak (dan sebaliknya)", () => {
  const asal = process.env.MIDTRANS_SERVER_KEY;
  process.env.MIDTRANS_SERVER_KEY = "Mid-server-PROD";
  assert.throws(() => svc.signatureValid({ order_id: "a", status_code: "200", gross_amount: "1", signature_key: "x" }), /produksi/i);
  process.env.MIDTRANS_SERVER_KEY = asal;
});

test("petakanStatus", () => {
  assert.equal(svc.petakanStatus({ transaction_status: "settlement" }), "lunas");
  assert.equal(svc.petakanStatus({ transaction_status: "capture", fraud_status: "accept" }), "lunas");
  assert.equal(svc.petakanStatus({ transaction_status: "capture", fraud_status: "challenge" }), "menunggu");
  assert.equal(svc.petakanStatus({ transaction_status: "pending" }), "menunggu");
  assert.equal(svc.petakanStatus({ transaction_status: "expire" }), "kedaluwarsa");
  for (const s of ["deny", "cancel", "failure"]) assert.equal(svc.petakanStatus({ transaction_status: s }), "gagal");
  assert.equal(svc.petakanStatus({ transaction_status: "refund" }), "dikembalikan");
});

test("item_details: jumlah selalu sama dengan gross_amount, qty pecahan aman", () => {
  const items = [
    { product_id: 1, product_name: "Beras Pandan Wangi", quantity: "2.500", unit: "kg", subtotal: "30000.00" },
    { product_id: 2, product_name: "Cabai Rawit Segar Premium Super Besar Pilihan Desa Sukorejo", quantity: "0.333", unit: "kg", subtotal: "15499.60" },
  ];
  const { itemDetails, grossAmount } = svc.buatItemDetails(items, "45499.60");
  assert.equal(grossAmount, 45500);
  assert.equal(itemDetails.reduce((s, b) => s + b.price, 0), grossAmount);
  assert.ok(itemDetails.every((b) => Number.isInteger(b.price) && b.quantity === 1 && b.name.length <= 50));
});

test("settlement: pending → perlu-dikemas, idempoten bila dikirim dua kali", async () => {
  reset();
  const n = { order_id: "PSD-1-1234", status_code: "200", gross_amount: "45500.00", transaction_status: "settlement", payment_type: "bank_transfer", va_numbers: [{ bank: "bca" }], transaction_id: "t-1" };
  const a = await pay.terapkanStatusPembayaran("PSD-1-1234", n);
  assert.equal(a.hasil, "lunas-lanjut-dikemas");
  assert.equal(db.order.status, "perlu-dikemas");
  assert.equal(db.order.payment_status, "lunas");
  const b = await pay.terapkanStatusPembayaran("PSD-1-1234", n);
  assert.equal(b.hasil, "sudah-lunas");
  assert.equal(db.order.status, "perlu-dikemas");
  assert.equal(db.notif.length, 2); // keduanya tercatat di audit
});

test("nominal tidak cocok → tidak ada perubahan status", async () => {
  reset();
  const r = await pay.terapkanStatusPembayaran("PSD-1-1234", { order_id: "PSD-1-1234", gross_amount: "1000.00", transaction_status: "settlement" });
  assert.equal(r.hasil, "nominal-tidak-cocok");
  assert.equal(db.order.status, "pending");
  assert.equal(db.order.payment_status, "menunggu");
});

test("expire: pesanan dibatalkan sistem dan stok dikembalikan", async () => {
  reset();
  const r = await pay.terapkanStatusPembayaran("PSD-1-1234", { order_id: "PSD-1-1234", gross_amount: "45500.00", transaction_status: "expire" });
  assert.equal(r.hasil, "kedaluwarsa-pesanan-dibatalkan");
  assert.equal(db.order.status, "dibatalkan");
  assert.equal(db.stokDikembalikan, 2);
});

test("notifikasi 'pending' terlambat tidak menurunkan pesanan yang sudah lunas", async () => {
  reset({ status: "perlu-dikemas", payment_status: "lunas" });
  const r = await pay.terapkanStatusPembayaran("PSD-1-1234", { order_id: "PSD-1-1234", gross_amount: "45500.00", transaction_status: "pending" });
  assert.equal(r.hasil, "abaikan-penurunan-status");
  assert.equal(db.order.payment_status, "lunas");
});

test("dibayar setelah pesanan dibatalkan → lunas tapi ditandai perlu refund", async () => {
  reset({ status: "dibatalkan", payment_status: "kedaluwarsa" });
  const r = await pay.terapkanStatusPembayaran("PSD-1-1234", { order_id: "PSD-1-1234", gross_amount: "45500.00", transaction_status: "settlement" });
  assert.match(r.hasil, /perlu-refund/);
  assert.equal(db.order.status, "dibatalkan");
});

test("pesanan tak dikenal → ditemukan:false (webhook tetap dijawab 200)", async () => {
  db.order = null;
  const r = await pay.terapkanStatusPembayaran("TIDAK-ADA", { order_id: "TIDAK-ADA", transaction_status: "settlement" });
  assert.equal(r.ditemukan, false);
});

test("handler webhook: 403 untuk signature palsu, 200 untuk signature sah", async () => {
  reset();
  const asalFetch = global.fetch;
  global.fetch = async () => ({ status: 200, json: async () => ({ status_code: "404" }) }); // cekStatus → belum ada → pakai isi notifikasi
  const res = () => { const r = { code: 200 }; r.status = (c) => { r.code = c; return r; }; r.json = (b) => { r.body = b; return r; }; return r; };
  const n = { order_id: "PSD-1-1234", status_code: "200", gross_amount: "45500.00", transaction_status: "settlement", payment_type: "qris" };

  const palsu = res(); await pay.notifikasi({ body: { ...n, signature_key: "palsu" } }, palsu);
  assert.equal(palsu.code, 403);
  assert.equal(db.order.status, "pending");

  const sah = res(); await pay.notifikasi({ body: { ...n, signature_key: sig(n) } }, sah);
  assert.equal(sah.code, 200);
  assert.equal(db.order.status, "perlu-dikemas");
  global.fetch = asalFetch;
});

test("ongkir & voucher dihitung server; item_details memuat ongkir dan voucher negatif", () => {
  const { hitungBiaya } = require("../src/utils/pembayaran");
  assert.deepEqual(hitungBiaya("kurir-desa", null), { biayaKirim: 5000, diskon: 0 });
  assert.deepEqual(hitungBiaya("kurir-desa", "panenraya"), { biayaKirim: 5000, diskon: 5000 });
  assert.deepEqual(hitungBiaya("ambil-mandiri", "PANENRAYA"), { biayaKirim: 0, diskon: 0 }); // voucher hanya untuk kurir
  assert.deepEqual(hitungBiaya("kurir-desa", "KODE-NGASAL"), { biayaKirim: 5000, diskon: 0 });

  const items = [{ product_id: 1, product_name: "Beras", quantity: "2", unit: "kg", subtotal: "30000.00" }];
  const a = svc.buatItemDetails(items, 35000, { biayaKirim: 5000, diskon: 0 });
  assert.equal(a.grossAmount, 35000);
  assert.equal(a.itemDetails.reduce((s, b) => s + b.price, 0), 35000);
  const b = svc.buatItemDetails(items, 30000, { biayaKirim: 5000, diskon: 5000 });
  assert.equal(b.itemDetails.reduce((s, x) => s + x.price, 0), 30000);
  assert.ok(b.itemDetails.some((x) => x.price === -5000));
});

// Aturan pembayaran yang dipakai bersama oleh pembuatan pesanan, pembatalan, dan pembayaran Midtrans.

// Batas bayar (menit). Dashboard menampilkan "dibatalkan otomatis bila tidak dibayar dalam 15 menit".
const MENIT_BAYAR = Number(process.env.PAYMENT_WINDOW_MINUTES) || 15;

// Teks metode bayar dari aplikasi → jenis yang dipahami server.
//   cod      : bayar di tempat
//   saldo    : Saldo PasarDesa (dompet di aplikasi; belum ada ledger server → dianggap lunas, lihat catatan analisis)
//   midtrans : QRIS / VA / e-wallet / kartu lewat Snap ("QRIS" tetap diterima agar aplikasi lama tidak rusak)
function jenisMetode(teks) {
  const t = String(teks || "").toUpperCase();
  if (t.includes("COD")) return "cod";
  if (t.includes("SALDO")) return "saldo";
  if (t.includes("MIDTRANS") || t.includes("QRIS") || t.includes("TRANSFER") || t.includes("VA")) return "midtrans";
  return "cod";
}

// Ongkir kurir desa (flat) dan voucher gratis ongkir. Nilainya sama dengan konstanta di dashboard (ONGKIR_FLAT/SUBSIDI_ONGKIR)
// dan di aplikasi mobile (_kurirFee/_voucherValue); server yang menentukan.
const ONGKIR_KURIR_DESA = Number(process.env.ONGKIR_KURIR_DESA ?? 5000);
const VOUCHER_GRATIS_ONGKIR = { PANENRAYA: Number(process.env.VOUCHER_PANENRAYA_NILAI ?? 5000) };

function hitungBiaya(opsiPengiriman, kodeVoucher) {
  const biayaKirim = opsiPengiriman === "ambil-mandiri" ? 0 : ONGKIR_KURIR_DESA;
  const nilaiVoucher = VOUCHER_GRATIS_ONGKIR[String(kodeVoucher || "").trim().toUpperCase()] || 0;
  return { biayaKirim, diskon: Math.min(biayaKirim, nilaiVoucher) };
}

module.exports = { MENIT_BAYAR, jenisMetode, hitungBiaya };

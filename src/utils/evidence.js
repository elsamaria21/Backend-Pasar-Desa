// Foto bukti (komplain, tiket aduan, ulasan) diunggah lebih dulu lewat POST /api/uploads/evidence dan
// dirujuk dengan alamat relatif `/uploads/evidence/<file>`. Alamat dari klien dibersihkan di sini supaya
// hanya file milik kita yang bisa ditautkan (bukan URL luar), dan tanpa host (host berbeda tiap klien).
const POLA = /\/uploads\/evidence\/[A-Za-z0-9._-]+$/;

function normalisasiFoto(daftar, maks) {
  if (daftar === undefined || daftar === null) return [];
  if (!Array.isArray(daftar)) throw new Error("foto harus berupa daftar alamat.");
  if (daftar.length > maks) throw new Error(`Maksimal ${maks} foto.`);
  return daftar.map((url) => {
    const bersih = String(url).split("?")[0];
    const cocok = POLA.exec(bersih);
    if (!cocok) throw new Error("Alamat foto tidak valid. Unggah foto lewat /api/uploads/evidence dulu.");
    return cocok[0];
  });
}

module.exports = { normalisasiFoto };

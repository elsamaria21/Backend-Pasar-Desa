

## Dashboard Web dan Mobile

Dashboard mengambil data operasional dari MySQL, bukan data contoh yang ditanam pada endpoint.

- `GET /api/dashboard` — ringkasan, antrean pesanan, stok kritis, kategori, tren penjualan, kurir aktif, dan warta.
- `GET /api/mobile/dashboard` — endpoint yang sama untuk aplikasi mobile.
- Jalankan bagian `DASHBOARD WEB & MOBILE` di `database/pasar_desa.sql` setelah schema dasar.
- Endpoint tidak mengisi data contoh otomatis. Jika database belum memiliki pesanan, transaksi kas, kurir, atau warta, bagian tersebut dikembalikan kosong/nol sampai data asli dimasukkan.


### Hasil Panen
- `GET /api/harvests` — daftar hasil panen, dengan filter tanggal dan nama tanaman opsional.
- `POST /api/harvests` — menyimpan catatan hasil panen ke MySQL.
- Dashboard web dan mobile menampilkan ringkasan panen 30 hari terakhir serta daftar hasil panen terbaru.
- Jalankan ulang bagian terbaru dari `database/pasar_desa.sql` untuk membuat tabel `harvest_results`. Tidak ada hasil panen contoh yang ditambahkan.


## CRUD Web Admin dan Mobile

Gunakan `DASHBOARD_API.md` untuk endpoint CRUD bersama produk, kategori, pesanan, kas, dan hasil panen. Web admin dan aplikasi mobile membaca sumber data MySQL yang sama; jangan mengisi database dengan data contoh saat setup.

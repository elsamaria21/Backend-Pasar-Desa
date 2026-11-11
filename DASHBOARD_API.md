# PasarDesa API — Web Admin dan Mobile

Web admin dan aplikasi mobile menggunakan backend dan tabel MySQL yang sama. Untuk database baru, jalankan `database/pasar_desa.sql`. Untuk database lama yang sudah berisi tabel dashboard, backup dulu lalu jalankan sekali `database/migrations/2026-10-dashboard-crud.sql`. Isi `.env`, lalu `npm install` dan `npm run dev`.

## Konfigurasi

- `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
- `PORT` (default server mengikuti `server.js`)
- Frontend Next.js: atur `NEXT_PUBLIC_API_URL` ke URL backend, misalnya `http://localhost:3000/api`.
- Flutter emulator Android biasanya mengakses host development melalui `http://10.0.2.2:3000/api`; perangkat fisik memakai IP LAN komputer. Jangan gunakan `localhost` dari perangkat mobile untuk mengakses komputer.

## CRUD bersama

Semua endpoint mengembalikan JSON `{ success, data, message? }`. Produk dan kategori dipakai bersama oleh web admin dan mobile.

| Domain | GET | POST | PUT/PATCH | DELETE |
|---|---|---|---|---|
| Produk | `/api/products` | `/api/products` | `/api/products/:id` | `/api/products/:id` |
| Kategori | `/api/categories` | `/api/categories` | `/api/categories/:id` | `/api/categories/:id` |
| Pesanan bersama | `/api/orders` atau `/api/admin/orders` | sama | `/:id` | `/:id` |
| Kas admin | `/api/cash` atau `/api/admin/cash` | sama | `/:id` | `/:id` |
| Hasil panen | `/api/harvests` | `/api/harvests` | `/:id` | `/:id` |

Dashboard:
- `GET /api/dashboard`
- `GET /api/mobile/dashboard`

## Payload hasil panen

```json
{
  "namaPetani": "Nama Petani",
  "namaTanaman": "Padi",
  "jumlah": 250,
  "satuan": "kg",
  "kualitas": "baik",
  "tanggalPanen": "2026-10-11",
  "catatan": "Blok sawah timur"
}
```

Kualitas yang didukung: `baik`, `sedang`, `perlu-sortir`.

## Payload pesanan

```json
{
  "pembeli": "Nama Pembeli",
  "alamat": "Alamat pengiriman",
  "dropPoint": "Balai Desa",
  "metodeBayar": "QRIS",
  "status": "pending",
  "items": [
    { "productId": 1, "jumlah": 2, "satuan": "kg", "hargaSatuan": 12000 }
  ]
}
```

Stok produk berkurang saat pesanan dibuat dengan `productId`. Jangan mengirim data rahasia atau kredensial ke frontend. Untuk produksi, lindungi rute admin dengan autentikasi dan otorisasi admin sebelum dipublikasikan.

---

## Keamanan & akses (diperbarui)

- Semua rute `/api/admin/*`, `/api/cash`, `/api/harvests`, `/api/dashboard`, `/api/mobile/dashboard`, dan `/api/ai/*` **wajib** header `Authorization: Bearer <token>` dari akun ber-role `admin`. Tanpa token: 401, bukan admin: 403.
- Rute katalog (`GET /api/products`, `GET /api/categories`) tetap publik. Produk tersembunyi (`?includeHidden=true`) hanya tampil untuk admin. Menambah/mengubah/menghapus produk dan kategori khusus admin (`PUT` dan `PATCH` sama-sama didukung).
- Pesanan dari mobile (`POST /api/orders`): harga, status, dan kode dihitung server dari data produk; `hargaSatuan`/`status`/`kode` dari klien diabaikan. `productId` wajib. Pembatalan mengembalikan stok.
- Membuat akun admin: daftar lewat `/api/auth/register`, lalu jalankan `npm run make-admin -- email@desa.id` dan login ulang.
- Server menolak start bila `JWT_SECRET` kosong, kurang dari 32 karakter, atau masih placeholder.
- Jalankan `database/migrations/2026-11-keamanan-dan-tabel-hilang.sql` pada database yang sudah ada (menambah tabel `carts`, `orders`, `order_details`, kolom `users.phone`, dan stok desimal).

## Kas: ringkasan & penarikan saldo (admin)

| Method | Path | Fungsi |
|---|---|---|
| GET | `/api/cash/summary` | `saldoAktif`, `saldoTertahan` (escrow), `pesananBerjalan`, `omsetBulanIni` |
| POST | `/api/cash/withdrawals` | Body `{ "nominal": 2000000, "jalur": "bank" \| "tunai" }`. Minimal Rp 50.000, tidak boleh melebihi saldo aktif. Dicatat sebagai debit kategori `pencairan`. Respons `201` berisi `referenceCode` dan `saldoSetelah`. |

- Pengecekan saldo dan penulisan debit dijaga kunci (`GET_LOCK`) agar dua penarikan bersamaan tidak sama-sama lolos.
- `POST /api/cash` dengan `type: "debit"` juga ditolak bila melebihi saldo.
- Saldo tertahan = total pesanan berstatus `perlu-dikemas`, `diproses`, `siap-jemput`, `sedang-dikemas`, `dikirim`, `diantar`, `tiba-di-pos`, `komplain`.
- Status pesanan kini mencakup `diantar`, `tiba-di-pos`, dan `komplain` (jalankan `migrations/2026-11-status-pesanan-dan-kas.sql`). Omzet dihitung bersih: penjualan dikurangi koreksi pembatalan.

## Pesanan dashboard (admin)

- `GET /api/admin/orders` mengembalikan pesanan beserta item, wilayah (`rtRw`, `patokan`), `opsiPengiriman`, `kurir`, `tibaDiPosPada`, `komplain` (JSON), dan `kirimUlang`.
- `PATCH /api/admin/orders/:id` — `:id` boleh id numerik atau kode pesanan (mis. `PSD-20261024-0089`). Menerima `status`, `kurir`, `komplain`, `tibaDiPosPada`, `kirimUlang` (dan data pembeli). Mengembalikan pesanan terbaru di `data`.
- Alur status diperiksa server; loncat status ditolak `409`:
  `pending → perlu-dikemas → siap-jemput → diantar → tiba-di-pos → selesai`; `tiba-di-pos → komplain → selesai | perlu-dikemas (kirim ulang)`; pembatalan boleh dari status mana pun kecuali `dibatalkan`. Pesanan yang sudah dibatalkan tidak bisa dihidupkan lagi.
- Saat status menjadi `selesai`, penjualan **bersih** dicatat ke kas sekali (total dikurangi item komplain yang di-refund; tidak dicatat bila hasilnya 0). Membatalkan pesanan yang sudah selesai membalik tepat sebesar yang pernah dicatat dan mengembalikan stok.
- Jalankan `database/migrations/2026-11-pesanan-lengkap.sql` (setelah migrasi status & kas).

## API untuk aplikasi mobile (pembeli)

Semua memakai `Authorization: Bearer <token>` dari `POST /api/auth/login`, kecuali daftar produk, login, dan register.

| Method | Path | Fungsi |
|---|---|---|
| POST | `/api/auth/register` | `name`, `email`, `phone`, `password` (min. 8 karakter) |
| POST | `/api/auth/login` | Mengembalikan `data.token` (7 hari) |
| GET | `/api/products` | Katalog (hanya produk yang ditampilkan). Kategori utama dibaca dari `detail.kategoriInduk` |
| POST | `/api/orders` | Body: `items: [{ productId, jumlah }]`, `pembeli`, `telepon`, `alamat`, `catatan`, `opsiPengiriman` (`kurir-desa`/`ambil-mandiri`), `metodeBayar` (`QRIS`/`SALDO`/`COD`). Harga, total, dan kode pesanan dihitung server. Status awal `perlu-dikemas` |
| GET | `/api/orders` | Pesanan milik akun yang login |
| PATCH | `/api/orders/:id/status` | Batalkan (hanya `pending`/`perlu-dikemas`); stok dikembalikan |
| PATCH | `/api/orders/:id/receive` | Konfirmasi diterima, hanya saat `tiba-di-pos`; penjualan masuk kas |
| POST | `/api/orders/:id/komplain` | `alasan` (`tidak-segar`, `tidak-sesuai-timbangan`, `kemasan-rusak`, `tidak-sesuai-pesanan`, `lainnya`), `catatan`; hanya saat `tiba-di-pos` |

`:id` boleh id angka atau kode pesanan. Pembayaran QRIS/saldo di aplikasi masih simulasi; server menerima klaim "sudah dibayar" dari aplikasi tanpa verifikasi gateway.

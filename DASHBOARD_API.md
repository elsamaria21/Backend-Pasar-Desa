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

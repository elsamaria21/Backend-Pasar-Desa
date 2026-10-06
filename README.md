# Backend PasarDesa

Backend Express + MySQL untuk aplikasi Flutter PasarDesa UMKM.

## Catatan penting
Database SQL ini **tidak berisi data dummy**. Tidak ada akun contoh, kategori contoh, produk contoh, alamat contoh, atau saldo contoh.

FE yang dikirim saat ini masih memiliki beberapa data lokal/hardcode di Dart. Backend ini menyiapkan API dengan struktur data yang mengikuti model FE: `Product`, `CartLine`, `OrderEntry`, alamat, profil, saldo, notifikasi, dan review.

## Jalankan

1. Buat database dengan `database/pasar_desa.sql`.
2. Sesuaikan `.env` dengan MySQL lokal.
3. Jalankan:

```bash
npm install
npm run dev
```

## Android Emulator
Gunakan base URL Flutter:

`http://10.0.2.2:3000/api`

Untuk Flutter desktop/macOS:

`http://localhost:3000/api`

## Endpoint

### Auth
- POST `/api/auth/register`
- POST `/api/auth/login`
- POST `/api/auth/forgot-password`

Register body:
```json
{
  "name": "Nama Pengguna",
  "email": "email@contoh.com",
  "phone": "081234567890",
  "password": "123456",
  "confirmPassword": "123456"
}
```

Login body:
```json
{
  "emailOrPhone": "email@contoh.com",
  "password": "123456"
}
```

### Produk & kategori
- GET `/api/products`
- GET `/api/products/:id`
- POST `/api/products` (Bearer token, multipart)
- PUT `/api/products/:id` (Bearer token, multipart)
- DELETE `/api/products/:id` (Bearer token)
- GET `/api/categories`
- POST `/api/categories` (Bearer token)

### Keranjang
- GET `/api/cart`
- POST `/api/cart`
- PATCH `/api/cart/:id`
- DELETE `/api/cart/:id`
- PATCH `/api/cart/select-all`

### Pesanan
- GET `/api/orders`
- GET `/api/orders/:id`
- POST `/api/orders`
- PATCH `/api/orders/:id/status`

### User & alamat
- GET `/api/users/profile`
- PUT `/api/users/profile`
- GET `/api/addresses`
- POST `/api/addresses`
- PUT `/api/addresses/:id`
- DELETE `/api/addresses/:id`

### Saldo
- GET `/api/wallet`
- GET `/api/wallet/transactions`
- POST `/api/wallet/topup`

### Search
- GET `/api/search?q=...`
- GET `/api/search/history`
- GET `/api/search/suggestions?q=...`
- GET `/api/search/popular`
- GET `/api/search/recommendations`
- DELETE `/api/search/history`

### Notifikasi & review
- GET `/api/notifications`
- PATCH `/api/notifications/:id/read`
- PATCH `/api/notifications/read-all`
- GET `/api/reviews/:productId`
- POST `/api/reviews`

### AI
- POST `/api/ai/product-description` dengan multipart field `image`.
- Isi `OPENAI_API_KEY` jika fitur AI digunakan.

## Auth header
Untuk endpoint yang membutuhkan login:

`Authorization: Bearer <token>`

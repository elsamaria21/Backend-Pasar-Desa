-- Kolom tambahan produk untuk dashboard komoditas.
-- Isian yang tidak perlu difilter/diurutkan (spesifikasi, keunggulan, pengiriman, label tampilan, dll.)
-- disimpan di kolom JSON `detail`. Jumlah "terjual" dihitung dari pesanan, bukan disimpan.
-- Jalankan sekali.
ALTER TABLE products
  ADD COLUMN harga_coret DECIMAL(15,2) NULL,
  ADD COLUMN ukuran VARCHAR(100) NULL,
  ADD COLUMN sumber ENUM('Petani','UMKM','BUMDes') NULL,
  ADD COLUMN penjual VARCHAR(150) NULL,
  ADD COLUMN ketersediaan VARCHAR(50) NOT NULL DEFAULT 'Siap kirim',
  ADD COLUMN batas_stok_rendah DECIMAL(15,3) NULL,
  ADD COLUMN detail JSON NULL;

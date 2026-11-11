-- Kolom tambahan pesanan untuk dashboard: wilayah pembeli, opsi pengiriman, kurir, waktu tiba di pos, komplain.
-- `kurir` dan `komplain` berbentuk JSON (struktur sama dengan tipe Pesanan di dashboard). Jalankan sekali.
ALTER TABLE dashboard_orders
  ADD COLUMN id_pembayaran VARCHAR(80) NULL,
  ADD COLUMN rt_rw VARCHAR(50) NULL,
  ADD COLUMN patokan VARCHAR(255) NULL,
  ADD COLUMN opsi_pengiriman ENUM('kurir-desa','ambil-mandiri') NOT NULL DEFAULT 'kurir-desa',
  ADD COLUMN kurir JSON NULL,
  ADD COLUMN tiba_di_pos_pada DATETIME NULL,
  ADD COLUMN komplain JSON NULL,
  ADD COLUMN kirim_ulang TINYINT(1) NOT NULL DEFAULT 0;

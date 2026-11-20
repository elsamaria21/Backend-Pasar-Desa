-- Integrasi Midtrans (Snap). Jalankan sekali setelah migrasi pesanan sebelumnya.
--
-- payment_status:
--   menunggu     = tagihan Midtrans dibuat, belum dibayar (pesanan status "pending")
--   lunas        = Midtrans mengonfirmasi settlement/capture (pesanan lanjut "perlu-dikemas")
--   gagal        = ditolak/dibatalkan di Midtrans
--   kedaluwarsa  = melewati batas bayar
--   dikembalikan = refund/chargeback tercatat di Midtrans
--   cod          = bayar di tempat, tidak lewat gateway
ALTER TABLE dashboard_orders
  ADD COLUMN payment_status ENUM('menunggu','lunas','gagal','kedaluwarsa','dikembalikan','cod') NOT NULL DEFAULT 'cod',
  ADD COLUMN payment_type VARCHAR(40) NULL,             -- bank_transfer, qris, gopay, shopeepay, credit_card, ...
  ADD COLUMN payment_channel VARCHAR(60) NULL,          -- bca, bni, permata, gopay, ...
  ADD COLUMN midtrans_transaction_id VARCHAR(64) NULL,
  ADD COLUMN midtrans_token VARCHAR(80) NULL,
  ADD COLUMN midtrans_redirect_url VARCHAR(255) NULL,
  ADD COLUMN payment_expires_at DATETIME NULL,
  ADD COLUMN paid_at DATETIME NULL,
  ADD INDEX idx_orders_payment_expiry (payment_status, status, payment_expires_at);

-- Pesanan lama (sebelum Midtrans) yang bukan COD dianggap sudah lunas, supaya dashboard tidak menampilkannya "belum bayar".
UPDATE dashboard_orders
   SET payment_status = 'lunas', paid_at = created_at
 WHERE payment_method IS NOT NULL
   AND UPPER(payment_method) NOT LIKE '%COD%'
   AND status NOT IN ('pending','dibatalkan');

-- Jejak setiap notifikasi Midtrans (audit + bahan penelusuran bila ada selisih dana).
CREATE TABLE IF NOT EXISTS payment_notifications (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  order_code VARCHAR(80) NOT NULL,
  midtrans_transaction_id VARCHAR(64) NULL,
  transaction_status VARCHAR(30) NULL,
  fraud_status VARCHAR(30) NULL,
  status_code VARCHAR(10) NULL,
  gross_amount VARCHAR(30) NULL,
  payment_type VARCHAR(40) NULL,
  sumber ENUM('webhook','sinkron','sweeper') NOT NULL DEFAULT 'webhook',
  hasil VARCHAR(60) NULL,
  raw JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_payment_notifications_order (order_code, created_at)
);

-- Ongkir & voucher dihitung SERVER (bukan dipercaya dari aplikasi). `total` tetap = nilai item (dasar pencatatan kas penjual);
-- yang dibayar pembeli lewat Midtrans = total + biaya_kirim - diskon.
ALTER TABLE dashboard_orders
  ADD COLUMN biaya_kirim DECIMAL(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN diskon DECIMAL(15,2) NOT NULL DEFAULT 0;

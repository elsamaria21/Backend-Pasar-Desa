-- Siapa yang membatalkan pesanan (pembeli/admin) beserta alasan & waktunya, dan ulasan/rating pembeli.
-- Jalankan sekali.
ALTER TABLE dashboard_orders
  ADD COLUMN dibatalkan_oleh ENUM('pembeli','admin','sistem') NULL,
  ADD COLUMN alasan_batal VARCHAR(255) NULL,
  ADD COLUMN dibatalkan_pada DATETIME NULL;

-- Satu ulasan per pesanan (pesanan harus sudah selesai). Rating berlaku untuk semua item di pesanan itu.
CREATE TABLE IF NOT EXISTS order_reviews (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id BIGINT NOT NULL UNIQUE,
  user_id INT NULL,
  rating TINYINT NOT NULL,
  tags JSON NULL,
  note TEXT NULL,
  courier_liked TINYINT(1) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES dashboard_orders(id) ON DELETE CASCADE
);

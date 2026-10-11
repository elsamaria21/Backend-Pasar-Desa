USE pasar_desa;

-- Jalankan sekali pada database lama yang sudah memiliki tabel products/dashboard_orders.
ALTER TABLE products
  ADD COLUMN sku VARCHAR(80) NULL UNIQUE,
  ADD COLUMN origin_block VARCHAR(255) NULL,
  ADD COLUMN unit VARCHAR(30) NOT NULL DEFAULT 'kg',
  ADD COLUMN max_stock INT NOT NULL DEFAULT 0,
  ADD COLUMN is_visible TINYINT(1) NOT NULL DEFAULT 1,
  ADD COLUMN tag VARCHAR(100) NULL,
  ADD COLUMN price_note VARCHAR(255) NULL;

ALTER TABLE dashboard_orders
  MODIFY COLUMN status ENUM('pending','perlu-dikemas','diproses','siap-jemput','sedang-dikemas','dikirim','selesai','dibatalkan') NOT NULL DEFAULT 'pending',
  ADD COLUMN phone VARCHAR(30) NULL,
  ADD COLUMN notes TEXT NULL;

CREATE TABLE IF NOT EXISTS dashboard_order_items (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  order_id BIGINT NOT NULL,
  product_id INT NULL,
  product_name VARCHAR(255) NOT NULL,
  quantity DECIMAL(15,3) NOT NULL,
  unit VARCHAR(30) NOT NULL DEFAULT 'kg',
  unit_price DECIMAL(15,2) NOT NULL DEFAULT 0,
  subtotal DECIMAL(15,2) NOT NULL DEFAULT 0,
  tag VARCHAR(100) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_order_items_order (order_id),
  CONSTRAINT fk_dashboard_order_items_order FOREIGN KEY (order_id) REFERENCES dashboard_orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_dashboard_order_items_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
);

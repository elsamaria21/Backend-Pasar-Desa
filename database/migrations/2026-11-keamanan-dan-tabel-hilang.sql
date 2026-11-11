-- Migrasi 2026-11: melengkapi tabel yang dipakai controller tetapi belum ada di pasar_desa.sql,
-- dan mengubah stok menjadi desimal agar pesanan pecahan (mis. 2,5 kg) tidak dibulatkan.
-- Aman dijalankan pada database yang sudah ada.

ALTER TABLE users ADD COLUMN phone VARCHAR(30) NULL; -- jalankan sekali (MySQL tidak mendukung IF NOT EXISTS untuk kolom)

ALTER TABLE products
  MODIFY stock DECIMAL(15,3) NOT NULL DEFAULT 0,
  MODIFY max_stock DECIMAL(15,3) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS carts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  product_id INT NOT NULL,
  quantity DECIMAL(15,3) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_cart_user_product (user_id, product_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  total DECIMAL(15,2) NOT NULL DEFAULT 0,
  address TEXT NULL,
  payment_method VARCHAR(50) NULL,
  status ENUM('pending','diproses','dikirim','selesai','dibatalkan') NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS order_details (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  product_id INT NOT NULL,
  quantity DECIMAL(15,3) NOT NULL,
  price DECIMAL(15,2) NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id)
);

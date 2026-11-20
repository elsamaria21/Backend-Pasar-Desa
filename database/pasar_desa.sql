-- =====================================================================================================
-- PASAR DESA — skema database lengkap (satu file)
--
-- AMAN DIJALANKAN BERULANG KALI, di database KOSONG maupun database LAMA yang sudah berisi data:
--   * tabel dibuat hanya bila belum ada (CREATE TABLE IF NOT EXISTS)
--   * kolom/indeks ditambahkan hanya bila belum ada (dicek lewat information_schema)
--   * data yang sudah ada tidak dihapus
-- Menggantikan seluruh isi folder migrations/ (file lama boleh diarsipkan, tidak perlu dijalankan lagi).
-- Tidak memakai DELIMITER/stored procedure, jadi jalan di phpMyAdmin (tab SQL) maupun `mysql < file.sql`.
-- Cara pakai: tempel/jalankan seluruh isi file ini, lalu restart backend.
-- =====================================================================================================

CREATE DATABASE IF NOT EXISTS pasar_desa;

USE pasar_desa;

-- =====================================================
-- USERS
-- =====================================================

CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    role ENUM('user', 'admin') DEFAULT 'user',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- CATEGORIES
-- =====================================================

CREATE TABLE IF NOT EXISTS categories (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- PRODUCTS
-- =====================================================

CREATE TABLE IF NOT EXISTS products (
    id INT AUTO_INCREMENT PRIMARY KEY,
    category_id INT NULL,
    user_id INT NULL,

    name VARCHAR(255) NOT NULL,
    description TEXT,
    price DECIMAL(15,2) NOT NULL DEFAULT 0,
    stock INT NOT NULL DEFAULT 0,
    image VARCHAR(500) NULL,
    sku VARCHAR(80) NULL UNIQUE,
    origin_block VARCHAR(255) NULL,
    unit VARCHAR(30) NOT NULL DEFAULT 'kg',
    max_stock INT NOT NULL DEFAULT 0,
    is_visible TINYINT(1) NOT NULL DEFAULT 1,
    tag VARCHAR(100) NULL,
    price_note VARCHAR(255) NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    FOREIGN KEY (category_id)
        REFERENCES categories(id)
        ON DELETE SET NULL,

    FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE SET NULL
);

-- =====================================================
-- SEARCH HISTORY
-- =====================================================

CREATE TABLE IF NOT EXISTS search_history (
    id INT AUTO_INCREMENT PRIMARY KEY,

    user_id INT NOT NULL,

    keyword VARCHAR(255) NOT NULL,

    search_count INT NOT NULL DEFAULT 1,

    last_searched_at TIMESTAMP
        DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    UNIQUE KEY unique_user_keyword
        (user_id, keyword),

    INDEX idx_user_search
        (user_id, search_count),

    INDEX idx_keyword
        (keyword),

    FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
);

-- =====================================================
-- DASHBOARD WEB & MOBILE (data operasional, tanpa data dummy)
-- Jalankan bagian ini setelah tabel dasar dibuat.
-- =====================================================

CREATE TABLE IF NOT EXISTS dashboard_orders (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    order_code VARCHAR(80) NOT NULL UNIQUE,
    user_id INT NULL,
    customer_name VARCHAR(150) NOT NULL,
    address TEXT NULL,
    drop_point VARCHAR(255) NULL,
    payment_method VARCHAR(50) NULL,
    phone VARCHAR(30) NULL,
    notes TEXT NULL,
    status ENUM('pending','perlu-dikemas','diproses','siap-jemput','sedang-dikemas','dikirim','diantar','tiba-di-pos','komplain','selesai','dibatalkan') NOT NULL DEFAULT 'pending',
    total DECIMAL(15,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_dashboard_orders_status_created (status, created_at),
    CONSTRAINT fk_dashboard_orders_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- =====================================================
-- PESANAN BERSAMA WEB ADMIN & MOBILE
-- Kedua aplikasi membaca dan mengubah tabel yang sama.
-- =====================================================

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
    CONSTRAINT fk_dashboard_order_items_order FOREIGN KEY (order_id)
      REFERENCES dashboard_orders(id) ON DELETE CASCADE,
    CONSTRAINT fk_dashboard_order_items_product FOREIGN KEY (product_id)
      REFERENCES products(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS dashboard_cash_transactions (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    type ENUM('credit','debit') NOT NULL,
    category VARCHAR(80) NOT NULL,
    description VARCHAR(255) NOT NULL,
    amount DECIMAL(15,2) NOT NULL,
    reference_code VARCHAR(100) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_dashboard_cash_category_created (category, created_at)
);

CREATE TABLE IF NOT EXISTS dashboard_news (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    label VARCHAR(50) NOT NULL DEFAULT 'Info',
    title VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    is_published TINYINT(1) NOT NULL DEFAULT 0,
    published_at DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_dashboard_news_published (is_published, published_at)
);

CREATE TABLE IF NOT EXISTS dashboard_couriers (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    courier_name VARCHAR(150) NOT NULL,
    vehicle VARCHAR(150) NULL,
    route VARCHAR(255) NULL,
    estimated_arrival DATETIME NULL,
    phone VARCHAR(30) NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'aktif',
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- HASIL PANEN (data operasional, tanpa data dummy)
-- =====================================================

CREATE TABLE IF NOT EXISTS harvest_results (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    farmer_name VARCHAR(150) NOT NULL,
    crop_name VARCHAR(150) NOT NULL,
    quantity DECIMAL(15,3) NOT NULL,
    unit VARCHAR(30) NOT NULL DEFAULT 'kg',
    quality ENUM('baik','sedang','perlu-sortir') NOT NULL DEFAULT 'baik',
    harvest_date DATE NOT NULL,
    notes TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_harvest_date (harvest_date),
    INDEX idx_harvest_crop_date (crop_name, harvest_date)
);

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

CREATE TABLE IF NOT EXISTS complaints (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(30) NOT NULL UNIQUE,
  user_id INT NOT NULL,
  topik VARCHAR(60) NOT NULL,
  order_code VARCHAR(60) NULL,
  judul VARCHAR(150) NOT NULL,
  deskripsi TEXT NULL,
  foto JSON NULL,
  solusi_diminta VARCHAR(100) NULL,
  status ENUM('diverifikasi','diproses','selesai') NOT NULL DEFAULT 'diverifikasi',
  balasan TEXT NULL,
  dibalas_pada DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ==========================================
-- TABEL ALAMAT PENGGUNA PASAR DESA
-- ==========================================

CREATE TABLE IF NOT EXISTS user_addresses (
    id INT AUTO_INCREMENT PRIMARY KEY,

    user_id INT NOT NULL,

    recipient_name VARCHAR(150) NOT NULL,
    phone VARCHAR(30) NOT NULL,

    label ENUM(
        'Rumah',
        'Toko/Lapak',
        'Kantor Desa',
        'Lainnya'
    ) NOT NULL DEFAULT 'Rumah',

    dusun VARCHAR(100) NULL,
    rt_rw VARCHAR(50) NULL,

    full_address TEXT NOT NULL,
    address_note VARCHAR(255) NULL,

    -- KOORDINAT GOOGLE MAPS
    latitude DECIMAL(10,7) NULL,
    longitude DECIMAL(10,7) NULL,

    -- ALAMAT UTAMA
    is_primary TINYINT(1) NOT NULL DEFAULT 0,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    INDEX idx_user_addresses_user (user_id),

    CONSTRAINT fk_user_addresses_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
);

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

-- =====================================================================================================
-- Kolom & indeks tambahan untuk database lama (dilewati otomatis bila sudah ada)
-- =====================================================================================================

-- ---- users ----
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'phone') = 0,
  'ALTER TABLE users ADD COLUMN phone VARCHAR(30) NULL', 'DO 0');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

-- ---- products (dashboard CRUD + komoditas lengkap) ----
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'sku') = 0,
  'ALTER TABLE products ADD COLUMN sku VARCHAR(80) NULL UNIQUE', 'DO 0');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'origin_block') = 0,
  'ALTER TABLE products ADD COLUMN origin_block VARCHAR(255) NULL', 'DO 0');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'unit') = 0,
  'ALTER TABLE products ADD COLUMN unit VARCHAR(30) NOT NULL DEFAULT ''kg''', 'DO 0');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'max_stock') = 0,
  'ALTER TABLE products ADD COLUMN max_stock INT NOT NULL DEFAULT 0', 'DO 0');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'is_visible') = 0,
  'ALTER TABLE products ADD COLUMN is_visible TINYINT(1) NOT NULL DEFAULT 1', 'DO 0');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'tag') = 0,
  'ALTER TABLE products ADD COLUMN tag VARCHAR(100) NULL', 'DO 0');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'price_note') = 0,
  'ALTER TABLE products ADD COLUMN price_note VARCHAR(255) NULL', 'DO 0');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'harga_coret') = 0,
  'ALTER TABLE products ADD COLUMN harga_coret DECIMAL(15,2) NULL', 'DO 0');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'ukuran') = 0,
  'ALTER TABLE products ADD COLUMN ukuran VARCHAR(100) NULL', 'DO 0');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'sumber') = 0,
  'ALTER TABLE products ADD COLUMN sumber ENUM(''Petani'',''UMKM'',''BUMDes'') NULL', 'DO 0');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'penjual') = 0,
  'ALTER TABLE products ADD COLUMN penjual VARCHAR(150) NULL', 'DO 0');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'ketersediaan') = 0,
  'ALTER TABLE products ADD COLUMN ketersediaan VARCHAR(50) NOT NULL DEFAULT ''Siap kirim''', 'DO 0');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'batas_stok_rendah') = 0,
  'ALTER TABLE products ADD COLUMN batas_stok_rendah DECIMAL(15,3) NULL', 'DO 0');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'detail') = 0,
  'ALTER TABLE products ADD COLUMN detail JSON NULL', 'DO 0');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

-- Stok desimal agar pesanan pecahan (mis. 2,5 kg) tidak dibulatkan (MODIFY aman diulang).
ALTER TABLE products MODIFY stock DECIMAL(15,3) NOT NULL DEFAULT 0, MODIFY max_stock DECIMAL(15,3) NOT NULL DEFAULT 0;

-- ---- dashboard_orders (pesanan, pembatalan) ----
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'dashboard_orders' AND COLUMN_NAME = 'phone') = 0,
  'ALTER TABLE dashboard_orders ADD COLUMN phone VARCHAR(30) NULL', 'DO 0');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'dashboard_orders' AND COLUMN_NAME = 'notes') = 0,
  'ALTER TABLE dashboard_orders ADD COLUMN notes TEXT NULL', 'DO 0');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'dashboard_orders' AND COLUMN_NAME = 'id_pembayaran') = 0,
  'ALTER TABLE dashboard_orders ADD COLUMN id_pembayaran VARCHAR(80) NULL', 'DO 0');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'dashboard_orders' AND COLUMN_NAME = 'rt_rw') = 0,
  'ALTER TABLE dashboard_orders ADD COLUMN rt_rw VARCHAR(50) NULL', 'DO 0');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'dashboard_orders' AND COLUMN_NAME = 'patokan') = 0,
  'ALTER TABLE dashboard_orders ADD COLUMN patokan VARCHAR(255) NULL', 'DO 0');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'dashboard_orders' AND COLUMN_NAME = 'opsi_pengiriman') = 0,
  'ALTER TABLE dashboard_orders ADD COLUMN opsi_pengiriman ENUM(''kurir-desa'',''ambil-mandiri'') NOT NULL DEFAULT ''kurir-desa''', 'DO 0');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'dashboard_orders' AND COLUMN_NAME = 'kurir') = 0,
  'ALTER TABLE dashboard_orders ADD COLUMN kurir JSON NULL', 'DO 0');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'dashboard_orders' AND COLUMN_NAME = 'tiba_di_pos_pada') = 0,
  'ALTER TABLE dashboard_orders ADD COLUMN tiba_di_pos_pada DATETIME NULL', 'DO 0');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'dashboard_orders' AND COLUMN_NAME = 'komplain') = 0,
  'ALTER TABLE dashboard_orders ADD COLUMN komplain JSON NULL', 'DO 0');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'dashboard_orders' AND COLUMN_NAME = 'kirim_ulang') = 0,
  'ALTER TABLE dashboard_orders ADD COLUMN kirim_ulang TINYINT(1) NOT NULL DEFAULT 0', 'DO 0');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'dashboard_orders' AND COLUMN_NAME = 'dibatalkan_oleh') = 0,
  'ALTER TABLE dashboard_orders ADD COLUMN dibatalkan_oleh ENUM(''pembeli'',''admin'',''sistem'') NULL', 'DO 0');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'dashboard_orders' AND COLUMN_NAME = 'alasan_batal') = 0,
  'ALTER TABLE dashboard_orders ADD COLUMN alasan_batal VARCHAR(255) NULL', 'DO 0');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'dashboard_orders' AND COLUMN_NAME = 'dibatalkan_pada') = 0,
  'ALTER TABLE dashboard_orders ADD COLUMN dibatalkan_pada DATETIME NULL', 'DO 0');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

-- Daftar status lengkap yang dipakai dashboard (MODIFY aman diulang).
ALTER TABLE dashboard_orders MODIFY status ENUM('pending','perlu-dikemas','diproses','siap-jemput','sedang-dikemas','dikirim','diantar','tiba-di-pos','komplain','selesai','dibatalkan') NOT NULL DEFAULT 'pending';

-- ---- dashboard_orders (Midtrans) ----
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'dashboard_orders' AND COLUMN_NAME = 'payment_status') = 0,
  'ALTER TABLE dashboard_orders ADD COLUMN payment_status ENUM(''menunggu'',''lunas'',''gagal'',''kedaluwarsa'',''dikembalikan'',''cod'') NOT NULL DEFAULT ''cod''', 'DO 0');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'dashboard_orders' AND COLUMN_NAME = 'payment_type') = 0,
  'ALTER TABLE dashboard_orders ADD COLUMN payment_type VARCHAR(40) NULL', 'DO 0');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'dashboard_orders' AND COLUMN_NAME = 'payment_channel') = 0,
  'ALTER TABLE dashboard_orders ADD COLUMN payment_channel VARCHAR(60) NULL', 'DO 0');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'dashboard_orders' AND COLUMN_NAME = 'midtrans_transaction_id') = 0,
  'ALTER TABLE dashboard_orders ADD COLUMN midtrans_transaction_id VARCHAR(64) NULL', 'DO 0');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'dashboard_orders' AND COLUMN_NAME = 'midtrans_token') = 0,
  'ALTER TABLE dashboard_orders ADD COLUMN midtrans_token VARCHAR(80) NULL', 'DO 0');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'dashboard_orders' AND COLUMN_NAME = 'midtrans_redirect_url') = 0,
  'ALTER TABLE dashboard_orders ADD COLUMN midtrans_redirect_url VARCHAR(255) NULL', 'DO 0');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'dashboard_orders' AND COLUMN_NAME = 'payment_expires_at') = 0,
  'ALTER TABLE dashboard_orders ADD COLUMN payment_expires_at DATETIME NULL', 'DO 0');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'dashboard_orders' AND COLUMN_NAME = 'paid_at') = 0,
  'ALTER TABLE dashboard_orders ADD COLUMN paid_at DATETIME NULL', 'DO 0');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'dashboard_orders' AND COLUMN_NAME = 'biaya_kirim') = 0,
  'ALTER TABLE dashboard_orders ADD COLUMN biaya_kirim DECIMAL(15,2) NOT NULL DEFAULT 0', 'DO 0');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'dashboard_orders' AND COLUMN_NAME = 'diskon') = 0,
  'ALTER TABLE dashboard_orders ADD COLUMN diskon DECIMAL(15,2) NOT NULL DEFAULT 0', 'DO 0');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'dashboard_orders' AND INDEX_NAME = 'idx_orders_payment_expiry') = 0,
  'ALTER TABLE dashboard_orders ADD INDEX idx_orders_payment_expiry (payment_status, status, payment_expires_at)', 'DO 0');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

-- Pesanan lama (sebelum Midtrans) non-COD dianggap sudah lunas. Hanya menyentuh baris yang masih bernilai bawaan 'cod',
-- jadi aman diulang dan tidak menimpa status pembayaran yang sudah diisi gateway.
UPDATE dashboard_orders SET payment_status = 'lunas', paid_at = created_at
 WHERE payment_status = 'cod' AND payment_method IS NOT NULL AND UPPER(payment_method) NOT LIKE '%COD%' AND status NOT IN ('pending','dibatalkan');

-- ---- order_reviews (foto & rating per komoditas) ----
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'order_reviews' AND COLUMN_NAME = 'photos') = 0,
  'ALTER TABLE order_reviews ADD COLUMN photos JSON NULL', 'DO 0');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'order_reviews' AND COLUMN_NAME = 'item_ratings') = 0,
  'ALTER TABLE order_reviews ADD COLUMN item_ratings JSON NULL', 'DO 0');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

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
    status ENUM('pending','perlu-dikemas','diproses','siap-jemput','sedang-dikemas','dikirim','selesai','dibatalkan') NOT NULL DEFAULT 'pending',
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

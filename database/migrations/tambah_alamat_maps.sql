
USE pasar_desa;

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

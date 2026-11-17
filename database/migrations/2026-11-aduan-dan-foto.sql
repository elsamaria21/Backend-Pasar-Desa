-- Tiket aduan umum dari pembeli (aplikasi mobile: Pusat Bantuan → Buat Tiket Aduan), foto ulasan, dan
-- rating per komoditas. Foto disimpan sebagai daftar alamat relatif /uploads/evidence/... (JSON). Jalankan sekali.
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

ALTER TABLE order_reviews
  ADD COLUMN photos JSON NULL,
  ADD COLUMN item_ratings JSON NULL;

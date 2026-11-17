const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Foto bukti komplain, tiket aduan, dan ulasan dari pembeli (maks. 5 MB per foto).
const folder = path.join(__dirname, "../../uploads/evidence");
if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });

const ekstensi = { "image/jpeg": ".jpg", "image/jpg": ".jpg", "image/png": ".png", "image/webp": ".webp" };

module.exports = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, folder),
    // Ekstensi ditentukan dari jenis file yang lolos filter, bukan dari nama file kiriman klien.
    filename: (req, file, cb) => cb(null, `bukti-${Date.now()}-${Math.round(Math.random() * 1e6)}${ekstensi[file.mimetype]}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 4 },
  fileFilter: (req, file, cb) => (ekstensi[file.mimetype] ? cb(null, true) : cb(new Error("Format foto harus JPG, PNG, atau WEBP."), false)),
});

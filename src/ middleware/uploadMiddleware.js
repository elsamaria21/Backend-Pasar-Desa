const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Folder penyimpanan foto produk
const uploadPath = path.join(
  __dirname,
  "../../uploads/products"
);

// Buat folder otomatis kalau belum ada
if (!fs.existsSync(uploadPath)) {
  fs.mkdirSync(uploadPath, {
    recursive: true,
  });
}

// Pengaturan penyimpanan
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadPath);
  },

  filename: function (req, file, cb) {
    const extension = path.extname(
      file.originalname
    );

    const fileName =
      "product-" +
      Date.now() +
      "-" +
      Math.round(
        Math.random() * 1000000
      ) +
      extension;

    cb(null, fileName);
  },
});

// Format file yang diperbolehkan
const fileFilter = function (
  req,
  file,
  cb
) {
  const allowedTypes = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
  ];

  if (
    allowedTypes.includes(
      file.mimetype
    )
  ) {
    cb(null, true);
  } else {
    cb(
      new Error(
        "Format gambar harus JPG, JPEG, PNG, atau WEBP."
      ),
      false
    );
  }
};

// Konfigurasi upload
const upload = multer({
  storage: storage,

  limits: {
    // Maksimal 5 MB
    fileSize: 5 * 1024 * 1024,
  },

  fileFilter: fileFilter,
});

module.exports = upload;
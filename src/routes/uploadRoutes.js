const router = require("express").Router();
const authMiddleware = require("../middleware/authMiddleware");
const upload = require("../middleware/evidenceUploadMiddleware");

// Unggah foto bukti (maks. 4 file, field `foto`). Mengembalikan alamat relatif untuk dikirim bersama komplain/aduan/ulasan.
router.post("/evidence", authMiddleware, (req, res) => {
  upload.array("foto", 4)(req, res, (err) => {
    if (err) return res.status(400).json({ success: false, message: err.message || "Gagal mengunggah foto." });
    const urls = (req.files || []).map((f) => `/uploads/evidence/${f.filename}`);
    if (!urls.length) return res.status(400).json({ success: false, message: "Tidak ada foto yang dikirim." });
    res.status(201).json({ success: true, data: { urls } });
  });
});

module.exports = router;

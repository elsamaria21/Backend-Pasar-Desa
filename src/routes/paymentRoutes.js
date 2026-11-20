const router = require("express").Router();
const authMiddleware = require("../middleware/authMiddleware");
const { buatTagihan, notifikasi, statusPembayaran, selesai, belumSelesai, galat } = require("../controllers/paymentController");

// Publik: dipanggil server Midtrans (dilindungi signature) dan halaman tujuan WebView.
router.post("/midtrans/notification", notifikasi);
router.get("/midtrans/finish", selesai);
router.get("/midtrans/unfinish", belumSelesai);
router.get("/midtrans/error", galat);

// Pembeli yang login.
router.post("/midtrans/snap", authMiddleware, buatTagihan);
router.get("/midtrans/status/:id", authMiddleware, statusPembayaran);

module.exports = router;

const router = require("express").Router();
const authMiddleware = require("../middleware/authMiddleware");
const { createComplaint, listMyComplaints } = require("../controllers/complaintController");

// Pembeli: buat tiket aduan dan lihat riwayat aduannya sendiri.
router.use(authMiddleware);
router.post("/", createComplaint);
router.get("/", listMyComplaints);

module.exports = router;

const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const adminMiddleware = require("../middleware/adminMiddleware");
const { getDashboard, getMobileDashboard } = require("../controllers/dashboardController");

const router = express.Router();

// Dashboard memuat saldo kas, omzet, dan antrean pesanan: khusus admin.
router.use(authMiddleware, adminMiddleware);

router.get("/", getDashboard);
router.get("/mobile", getMobileDashboard);

module.exports = router;

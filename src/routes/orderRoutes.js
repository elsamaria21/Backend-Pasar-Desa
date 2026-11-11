const express = require("express");
const { getOrders, getOrderById, createOrder, updateOrderStatus } = require("../controllers/orderController");
const authMiddleware = require("../middleware/authMiddleware");
const adminMiddleware = require("../middleware/adminMiddleware");

const router = express.Router();

// Pengguna hanya melihat/membuat pesanannya sendiri (controller memfilter berdasarkan req.user.id).
router.get("/", authMiddleware, getOrders);
router.get("/:id", authMiddleware, getOrderById);
router.post("/", authMiddleware, createOrder);

// Mengubah status pesanan = pekerjaan admin.
router.put("/:id/status", authMiddleware, adminMiddleware, updateOrderStatus);

module.exports = router;

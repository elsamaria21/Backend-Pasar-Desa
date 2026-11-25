const express = require("express");
const {
  getOrders,
  getOrderById,
  createOrder,
  updateOrderStatus,
} = require("../controllers/orderController");
const authMiddleware = require("../middleware/authMiddleware");
const adminMiddleware = require("../middleware/adminMiddleware");

const router = express.Router();

router.get("/", authMiddleware, getOrders);
router.get("/:id", authMiddleware, getOrderById);
router.post("/", authMiddleware, createOrder);

// Pembeli boleh membatalkan pesanan miliknya; controller memeriksa kepemilikan/status.
router.patch("/:id/status", authMiddleware, updateOrderStatus);

// Endpoint lama tetap tersedia untuk panel admin.
router.put("/:id/status", authMiddleware, adminMiddleware, updateOrderStatus);

module.exports = router;

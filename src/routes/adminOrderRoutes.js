const router = require("express").Router();
const authMiddleware = require("../middleware/authMiddleware");
const adminMiddleware = require("../middleware/adminMiddleware");
const { listOrders, createOrder, updateOrder, deleteOrder } = require("../controllers/adminOrderController");

// Semua rute pesanan admin: wajib login sebagai admin.
router.use(authMiddleware, adminMiddleware);

router.get("/", listOrders);
router.post("/", createOrder);
router.put("/:id", updateOrder);
router.patch("/:id", updateOrder);
router.delete("/:id", deleteOrder);

module.exports = router;

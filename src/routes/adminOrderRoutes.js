const router = require("express").Router();
const { listOrders, createOrder, updateOrder, deleteOrder } = require("../controllers/adminOrderController");
router.get("/", listOrders);
router.post("/", createOrder);
router.put("/:id", updateOrder);
router.patch("/:id", updateOrder);
router.delete("/:id", deleteOrder);
module.exports = router;

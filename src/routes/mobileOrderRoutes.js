const router = require("express").Router();
const authMiddleware = require("../middleware/authMiddleware");
const { listMyOrders, createMyOrder, getMyOrder, cancelMyOrder } = require("../controllers/mobileOrderController");
router.use(authMiddleware);
router.get("/", listMyOrders);
router.post("/", createMyOrder);
router.get("/:id", getMyOrder);
router.patch("/:id/status", cancelMyOrder);
module.exports = router;

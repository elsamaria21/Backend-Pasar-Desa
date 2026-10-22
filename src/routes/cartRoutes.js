const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const { getCart, addToCart, updateCart, deleteCart } = require("../controllers/cartController");

const router = express.Router();

// Semua route keranjang butuh login (controller memakai req.user.id).
router.use(authMiddleware);

router.get("/", getCart);
router.post("/", addToCart);
router.put("/:id", updateCart);
router.delete("/:id", deleteCart);

module.exports = router;
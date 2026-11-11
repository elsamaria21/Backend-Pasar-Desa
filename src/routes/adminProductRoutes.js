const router = require("express").Router();
const upload = require("../middleware/uploadMiddleware");
const authMiddleware = require("../middleware/authMiddleware");
const adminMiddleware = require("../middleware/adminMiddleware");
const { getProducts, getProductById, createProduct, updateProduct, deleteProduct } = require("../controllers/productController");

// Semua rute produk admin: wajib login sebagai admin.
router.use(authMiddleware, adminMiddleware);

router.get("/", getProducts);
router.get("/:id", getProductById);
router.post("/", upload.single("image"), createProduct);
router.put("/:id", upload.single("image"), updateProduct);
router.patch("/:id", upload.single("image"), updateProduct);
router.delete("/:id", deleteProduct);

module.exports = router;

const express = require("express");
const router = express.Router();
const upload = require("../middleware/uploadMiddleware");
const authMiddleware = require("../middleware/authMiddleware");
const adminMiddleware = require("../middleware/adminMiddleware");
const optionalAuthMiddleware = require("../middleware/optionalAuthMiddleware");
const { getProducts, getProductById, createProduct, updateProduct, deleteProduct } = require("../controllers/productController");

// Katalog: publik. Produk tersembunyi (?includeHidden=true) hanya tampil untuk admin.
router.get("/", optionalAuthMiddleware, getProducts);
router.get("/:id", optionalAuthMiddleware, getProductById);

// Kelola produk: khusus admin.
router.post("/", authMiddleware, adminMiddleware, upload.single("image"), createProduct);
router.put("/:id", authMiddleware, adminMiddleware, upload.single("image"), updateProduct);
router.patch("/:id", authMiddleware, adminMiddleware, upload.single("image"), updateProduct);
router.delete("/:id", authMiddleware, adminMiddleware, deleteProduct);

module.exports = router;

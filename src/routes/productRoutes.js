const express =
  require("express");

const router =
  express.Router();

const upload =
  require("../middleware/uploadMiddleware");

const authMiddleware =
  require("../middleware/authMiddleware");

const {
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
} =
  require("../controllers/productController");


// Semua produk
router.get(
  "/",
  getProducts
);


// Detail produk
router.get(
  "/:id",
  getProductById
);


// Tambah produk
router.post(
  "/",
  authMiddleware,
  upload.single("image"),
  createProduct
);


// Update produk
router.put(
  "/:id",
  authMiddleware,
  upload.single("image"),
  updateProduct
);


// Delete produk
router.delete(
  "/:id",
  authMiddleware,
  deleteProduct
);

module.exports =
  router;
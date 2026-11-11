const router = require("express").Router();
const authMiddleware = require("../middleware/authMiddleware");
const adminMiddleware = require("../middleware/adminMiddleware");
const { getCategories, createCategory, updateCategory, deleteCategory } = require("../controllers/categoryController");

// Daftar kategori boleh dibaca publik (dipakai katalog mobile); mengubahnya khusus admin.
router.get("/", getCategories);
router.post("/", authMiddleware, adminMiddleware, createCategory);
router.put("/:id", authMiddleware, adminMiddleware, updateCategory);
router.patch("/:id", authMiddleware, adminMiddleware, updateCategory);
router.delete("/:id", authMiddleware, adminMiddleware, deleteCategory);

module.exports = router;

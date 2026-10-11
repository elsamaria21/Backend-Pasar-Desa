const router = require("express").Router();
const { getCategories, createCategory, updateCategory, deleteCategory } = require("../controllers/categoryController");
router.get("/", getCategories);
router.post("/", createCategory);
router.put("/:id", updateCategory);
router.patch("/:id", updateCategory);
router.delete("/:id", deleteCategory);
module.exports = router;

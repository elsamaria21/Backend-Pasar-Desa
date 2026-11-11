const express = require("express");
const router = express.Router();
const upload = require("../middleware/uploadMiddleware");
const authMiddleware = require("../middleware/authMiddleware");
const adminMiddleware = require("../middleware/adminMiddleware");
const { generateProduct } = require("../controllers/aiController");

// Memakai kuota OpenAI dan menyimpan file upload: wajib login sebagai admin.
router.post(
  "/product-description",
  authMiddleware,
  adminMiddleware,
  upload.single("image"),
  generateProduct
);

module.exports = router;

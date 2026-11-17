const router = require("express").Router();
const authMiddleware = require("../middleware/authMiddleware");
const adminMiddleware = require("../middleware/adminMiddleware");
const { listReviews } = require("../controllers/adminReviewController");

// Ulasan pembeli: hanya admin.
router.use(authMiddleware, adminMiddleware);
router.get("/", listReviews);

module.exports = router;

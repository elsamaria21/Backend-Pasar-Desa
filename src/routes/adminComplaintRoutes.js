const router = require("express").Router();
const authMiddleware = require("../middleware/authMiddleware");
const adminMiddleware = require("../middleware/adminMiddleware");
const { listComplaints, updateComplaint } = require("../controllers/complaintController");

// Tiket aduan pembeli: hanya admin.
router.use(authMiddleware, adminMiddleware);
router.get("/", listComplaints);
router.patch("/:id", updateComplaint);

module.exports = router;

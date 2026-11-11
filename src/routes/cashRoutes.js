const router = require("express").Router();
const authMiddleware = require("../middleware/authMiddleware");
const adminMiddleware = require("../middleware/adminMiddleware");
const { list, create, update, remove, summary, withdraw } = require("../controllers/cashController");

// Buku kas hanya untuk admin.
router.use(authMiddleware, adminMiddleware);

router.get("/", list);
router.get("/summary", summary);
router.post("/withdrawals", withdraw);
router.post("/", create);
router.put("/:id", update);
router.patch("/:id", update);
router.delete("/:id", remove);

module.exports = router;

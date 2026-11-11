const router = require("express").Router();
const authMiddleware = require("../middleware/authMiddleware");
const adminMiddleware = require("../middleware/adminMiddleware");
const { listHarvests, createHarvest, updateHarvest, deleteHarvest } = require("../controllers/harvestController");

// Catatan hasil panen dikelola admin.
router.use(authMiddleware, adminMiddleware);

router.get("/", listHarvests);
router.post("/", createHarvest);
router.put("/:id", updateHarvest);
router.patch("/:id", updateHarvest);
router.delete("/:id", deleteHarvest);

module.exports = router;

const router = require("express").Router();
const { listHarvests, createHarvest, updateHarvest, deleteHarvest } = require("../controllers/harvestController");
router.get("/", listHarvests);
router.post("/", createHarvest);
router.put("/:id", updateHarvest);
router.patch("/:id", updateHarvest);
router.delete("/:id", deleteHarvest);
module.exports = router;

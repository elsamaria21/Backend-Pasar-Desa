const router = require("express").Router();
const { list, create, update, remove } = require("../controllers/cashController");
router.get("/", list);
router.post("/", create);
router.put("/:id", update);
router.patch("/:id", update);
router.delete("/:id", remove);
module.exports = router;

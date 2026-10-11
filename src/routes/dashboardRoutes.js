const express = require("express");
const { getDashboard, getMobileDashboard } = require("../controllers/dashboardController");

const router = express.Router();
router.get("/", getDashboard);
router.get("/mobile", getMobileDashboard);

module.exports = router;

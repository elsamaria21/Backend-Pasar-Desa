const express =
  require("express");

const router =
  express.Router();

const authMiddleware =
  require("../middleware/authMiddleware");

const {
  searchProducts,
  getHistory,
  getSuggestions,
  getPopularSearches,
  getRecommendations,
  deleteHistory,
} =
  require("../controllers/searchController");


// Search
router.get(
  "/",
  authMiddleware,
  searchProducts
);


// History
router.get(
  "/history",
  authMiddleware,
  getHistory
);


// Suggestion
router.get(
  "/suggestions",
  authMiddleware,
  getSuggestions
);


// Popular
router.get(
  "/popular",
  getPopularSearches
);


// Recommendation
router.get(
  "/recommendations",
  authMiddleware,
  getRecommendations
);


// Delete history
router.delete(
  "/history",
  authMiddleware,
  deleteHistory
);


module.exports =
  router;
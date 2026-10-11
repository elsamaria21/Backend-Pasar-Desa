const express =
  require("express");

const router =
  express.Router();

const upload =
  require("../middleware/uploadMiddleware");

const {
  generateProduct,
} =
  require("../controllers/aiController");


router.post(
  "/product-description",

  upload.single(
    "image"
  ),

  generateProduct
);


module.exports =
  router;
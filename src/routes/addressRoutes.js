
const express = require("express");

const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");

const {
  getAddresses,
  addAddress,
  updateAddress,
  setPrimaryAddress,
  deleteAddress
} = require("../controllers/addressController");

// Semua alamat harus menggunakan autentikasi
router.use(authMiddleware);

// GET semua alamat
router.get("/", getAddresses);

// POST tambah alamat
router.post("/", addAddress);

// PUT edit alamat
router.put("/:id", updateAddress);

// PATCH pilih alamat utama
router.patch("/:id/primary", setPrimaryAddress);

// DELETE hapus alamat
router.delete("/:id", deleteAddress);

module.exports = router;

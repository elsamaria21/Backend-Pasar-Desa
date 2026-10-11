const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

const app = express();

// =====================================================
// LOAD ROUTES SAFELY
// File route yang belum tersedia tidak akan menghentikan
// server, tetapi endpoint route tersebut belum aktif.
// =====================================================

function loadRoute(fileName) {
  const filePath = path.join(__dirname, "routes", fileName);

  if (!fs.existsSync(filePath)) {
    console.warn(`[ROUTE TIDAK DITEMUKAN] ${fileName}`);
    return express.Router();
  }

  try {
    const route = require(filePath);

    if (typeof route !== "function") {
      console.warn(`[ROUTE TIDAK VALID] ${fileName}`);
      return express.Router();
    }

    return route;
  } catch (error) {
    console.error(`[GAGAL MEMUAT ROUTE] ${fileName}:`, error.message);
    return express.Router();
  }
}

// =====================================================
// IMPORT ROUTES
// =====================================================

const authRoutes = loadRoute("authRoutes.js");
const productRoutes = loadRoute("productRoutes.js");
const aiRoutes = loadRoute("aiRoutes.js");
const searchRoutes = loadRoute("searchRoutes.js");

const dashboardRoutes = loadRoute("dashboardRoutes.js");
const harvestRoutes = loadRoute("harvestRoutes.js");
const categoryRoutes = loadRoute("categoryRoutes.js");

const adminOrderRoutes = loadRoute("adminOrderRoutes.js");
const mobileOrderRoutes = loadRoute("mobileOrderRoutes.js");
const cashRoutes = loadRoute("cashRoutes.js");

const adminProductRoutes = loadRoute("adminProductRoutes.js");
const cartRoutes = loadRoute("cartRoutes.js");
const orderRoutes = loadRoute("orderRoutes.js");
const userRoutes = loadRoute("userRoutes.js");

// =====================================================
// MIDDLEWARE
// =====================================================

app.use(
  cors({
    origin: "*",
  })
);

app.use(express.json());

app.use(
  express.urlencoded({
    extended: true,
  })
);

// =====================================================
// STATIC UPLOADS
// =====================================================

app.use(
  "/uploads",
  express.static(path.join(__dirname, "../uploads"))
);

// =====================================================
// AUTHENTICATION
// =====================================================

app.use("/api/auth", authRoutes);

// =====================================================
// PRODUCTS
// =====================================================

app.use("/api/products", productRoutes);
app.use("/api/admin/products", adminProductRoutes);

// =====================================================
// AI AND SEARCH
// =====================================================

app.use("/api/ai", aiRoutes);
app.use("/api/search", searchRoutes);

// =====================================================
// DASHBOARD
// =====================================================

app.use("/api/dashboard", dashboardRoutes);
app.use("/api/mobile/dashboard", dashboardRoutes);

// =====================================================
// HARVESTS AND CATEGORIES
// =====================================================

app.use("/api/harvests", harvestRoutes);
app.use("/api/categories", categoryRoutes);

// =====================================================
// ORDERS
// =====================================================

app.use("/api/admin/orders", adminOrderRoutes);
app.use("/api/orders", mobileOrderRoutes);
app.use("/api/order-management", orderRoutes);

// =====================================================
// CART
// =====================================================

app.use("/api/cart", cartRoutes);

// =====================================================
// CASH TRANSACTIONS
// =====================================================

app.use("/api/admin/cash", cashRoutes);
app.use("/api/cash", cashRoutes);

// =====================================================
// USER PROFILE
// =====================================================

app.use("/api/users", userRoutes);

// =====================================================
// HOME / API INFORMATION
// =====================================================

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Backend PasarDesa berjalan.",
    endpoints: {
      auth: "/api/auth",
      products: "/api/products",
      adminProducts: "/api/admin/products",
      ai: "/api/ai",
      search: "/api/search",
      dashboard: "/api/dashboard",
      mobileDashboard: "/api/mobile/dashboard",
      harvests: "/api/harvests",
      categories: "/api/categories",
      orders: "/api/orders",
      adminOrders: "/api/admin/orders",
      orderManagement: "/api/order-management",
      cart: "/api/cart",
      users: "/api/users",
      adminCash: "/api/admin/cash",
      cash: "/api/cash",
      uploads: "/uploads",
    },
  });
});

// =====================================================
// 404 - ROUTE NOT FOUND
// =====================================================

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Endpoint tidak ditemukan.",
    path: req.originalUrl,
    method: req.method,
  });
});

// =====================================================
// ERROR HANDLER
// =====================================================

app.use((error, req, res, next) => {
  console.error(error);

  if (error.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({
      success: false,
      message: "Ukuran foto maksimal 5 MB.",
    });
  }

  if (
    error.message &&
    error.message.includes("Format gambar")
  ) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }

  return res.status(500).json({
    success: false,
    message: "Terjadi kesalahan server.",
    error: error.message,
  });
});

// =====================================================
// EXPORT APP
// =====================================================

module.exports = app;
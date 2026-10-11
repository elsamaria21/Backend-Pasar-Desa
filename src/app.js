const express = require("express");
const cors = require("cors");
const path = require("path");

// =====================================================
// IMPORT ROUTES
// =====================================================

const authRoutes = require("./routes/authRoutes");
const productRoutes = require("./routes/productRoutes");
const aiRoutes = require("./routes/aiRoutes");
const searchRoutes = require("./routes/searchRoutes");

const dashboardRoutes = require("./routes/dashboardRoutes");
const harvestRoutes = require("./routes/harvestRoutes");
const categoryRoutes = require("./routes/categoryRoutes");

const adminOrderRoutes = require("./routes/adminOrderRoutes");
const mobileOrderRoutes = require("./routes/mobileOrderRoutes");
const cashRoutes = require("./routes/cashRoutes");

const adminProductRoutes = require("./routes/adminProductRoutes");
const cartRoutes = require("./routes/cartRoutes");
const orderRoutes = require("./routes/orderRoutes");
const userRoutes = require("./routes/userRoutes");

// =====================================================
// INITIALIZE APP
// =====================================================

const app = express();

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

// Admin orders
app.use("/api/admin/orders", adminOrderRoutes);

// Mobile orders
app.use("/api/orders", mobileOrderRoutes);

// Additional order management
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

  if (
    error.message &&
    error.message.includes("Format gambar")
  ) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }

  if (error.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({
      success: false,
      message: "Ukuran foto maksimal 5 MB.",
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


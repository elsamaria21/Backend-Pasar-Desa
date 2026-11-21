const express = require("express");
const cors = require("cors");
const path = require("path");

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

const app = express();

const corsOrigins = (process.env.CORS_ORIGIN || "").split(",").map((o) => o.trim()).filter(Boolean);

app.use(
  cors({
    origin: corsOrigins.length ? corsOrigins : "*",
  })
);

app.use(express.json());

app.use(
  express.urlencoded({
    extended: true,
  })
);

app.use(
  "/uploads",
  express.static(path.join(__dirname, "../uploads"))
);


app.use("/api/auth", authRoutes);

app.use("/api/products", productRoutes);
app.use("/api/admin/products", adminProductRoutes);

app.use("/api/ai", aiRoutes);
app.use("/api/search", searchRoutes);


app.use("/api/dashboard", dashboardRoutes);
app.use("/api/mobile/dashboard", dashboardRoutes);

app.use("/api/harvests", harvestRoutes);
app.use("/api/categories", categoryRoutes);

app.use("/api/admin/orders", adminOrderRoutes);

app.use("/api/orders", mobileOrderRoutes);

// Additional order management
app.use("/api/order-management", orderRoutes);

app.use("/api/cart", cartRoutes);

app.use("/api/admin/cash", cashRoutes);
app.use("/api/cash", cashRoutes);
app.use("/api/users", userRoutes);

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

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Endpoint tidak ditemukan.",
    path: req.originalUrl,
    method: req.method,
  });
});

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
    ...(process.env.NODE_ENV === "production" ? {} : { error: error.message }),
  });
});

module.exports = app;
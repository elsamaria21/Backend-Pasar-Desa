const {
  pool,
} = require("../config/database");

// Form multipart mengirim semua nilai sebagai teks, jadi "false" harus dibaca sebagai 0.
function parseBool(value, fallback = 1) {
  if (value === undefined || value === null || value === "") return fallback;
  if (value === true || value === 1 || value === "1" || String(value).toLowerCase() === "true") return 1;
  return 0;
}

// Jumlah terjual = total item pada pesanan yang sudah dibayar dan tidak dibatalkan.
const SQL_TERJUAL = `(SELECT COALESCE(SUM(oi.quantity), 0)
   FROM dashboard_order_items oi
   JOIN dashboard_orders o ON o.id = oi.order_id
   WHERE oi.product_id = p.id AND o.status NOT IN ('pending', 'dibatalkan')) AS terjual`;

const SUMBER_VALID = ["Petani", "UMKM", "BUMDes"];

// Kolom `detail` (JSON) menyimpan isian kaya dari dashboard: spesifikasi, keunggulan, pengiriman, label, dll.
function parseDetail(value) {
  if (value === undefined || value === null || value === "") return undefined;
  const obj = typeof value === "string" ? JSON.parse(value) : value;
  if (obj === null || typeof obj !== "object" || Array.isArray(obj)) throw new Error("detail harus berupa objek JSON.");
  return JSON.stringify(obj);
}

function isAdmin(req) {
  return req.user?.role === "admin";
}

function angkaTidakNegatif(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}


// =====================================================
// GET ALL PRODUCTS
// =====================================================

async function getProducts(
  req,
  res
) {
  try {
    const includeHidden = req.query.includeHidden === "true" && isAdmin(req);
    const [products] = await pool.execute(
      `SELECT p.*, c.name AS category_name, ${SQL_TERJUAL}
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       ${includeHidden ? "" : "WHERE p.is_visible = 1"}
       ORDER BY p.id DESC`
    );

    return res.json({
      success: true,
      data: products,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message:
        "Gagal mengambil produk.",
    });
  }
}


// =====================================================
// GET PRODUCT BY ID
// =====================================================

async function getProductById(
  req,
  res
) {
  try {
    const {
      id,
    } = req.params;

    const [
      products,
    ] = await pool.execute(
      `
      SELECT
        p.*,
        c.name AS category_name,
        ${SQL_TERJUAL}

      FROM products p

      LEFT JOIN categories c
        ON c.id = p.category_id

      WHERE p.id = ?

      LIMIT 1
      `,
      [id]
    );

    if (
      products.length ===
      0
    ) {
      return res.status(404).json({
        success: false,
        message:
          "Produk tidak ditemukan.",
      });
    }

    if (!products[0].is_visible && !isAdmin(req)) {
      return res.status(404).json({
        success: false,
        message: "Produk tidak ditemukan.",
      });
    }

    return res.json({
      success: true,
      data: products[0],
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message:
        "Gagal mengambil produk.",
    });
  }
}


// =====================================================
// CREATE PRODUCT
// =====================================================

async function createProduct(
  req,
  res
) {
  try {
    const {
      name,
      description,
      price,
      stock,
      category_id,
      sku,
      origin_block,
      unit,
      max_stock,
      is_visible,
      tag,
      price_note,
      harga_coret,
      ukuran,
      sumber,
      penjual,
      ketersediaan,
      batas_stok_rendah,
      detail,
    } = req.body;

    const userId =
      req.user?.id || null;

    if (
      !name ||
      price === undefined ||
      angkaTidakNegatif(price) === null ||
      angkaTidakNegatif(stock ?? 0) === null ||
      angkaTidakNegatif(max_stock ?? 0) === null
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Nama wajib diisi; harga, stok, dan stok maksimal harus angka 0 atau lebih.",
      });
    }

    if (sumber && !SUMBER_VALID.includes(sumber)) {
      return res.status(400).json({ success: false, message: "Sumber harus Petani, UMKM, atau BUMDes." });
    }

    let detailJson;
    try {
      detailJson = parseDetail(detail);
    } catch (e) {
      return res.status(400).json({ success: false, message: e.message });
    }

    let image = req.body.image || null;

    if (req.file) {
      image =
        `${req.protocol}://${req.get(
          "host"
        )}/uploads/products/${req.file.filename}`;
    }

    const [
      result,
    ] = await pool.execute(
      `
      INSERT INTO products
      (
        category_id,
        user_id,
        name,
        description,
        price,
        stock,
        image, sku, origin_block, unit, max_stock, is_visible, tag, price_note,
        harga_coret, ukuran, sumber, penjual, ketersediaan, batas_stok_rendah, detail
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        category_id ||
          null,

        userId,

        name,

        description ||
          "",

        Number(price),

        Number(stock || 0),

        image,
        sku || null,
        origin_block || null,
        unit || "kg",
        Number(max_stock || 0),
        parseBool(is_visible),
        tag || null,
        price_note || null,
        harga_coret === undefined || harga_coret === "" ? null : Number(harga_coret),
        ukuran || null,
        sumber || null,
        penjual || null,
        ketersediaan || "Siap kirim",
        batas_stok_rendah === undefined || batas_stok_rendah === "" ? null : Number(batas_stok_rendah),
        detailJson ?? null,
      ]
    );

    return res.status(201).json({
      success: true,
      message:
        "Produk berhasil ditambahkan.",

      data: {
        id: result.insertId,
        name,
        description,
        price,
        stock,
        image,
      },
    });
  } catch (error) {
    console.error(
      "CREATE PRODUCT ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Gagal menambahkan produk.",
    });
  }
}


// =====================================================
// UPDATE PRODUCT (PUT/PATCH)
// Hanya kolom yang dikirim yang diubah, jadi update parsial
// (mis. hanya stok) tidak menimpa kolom lain.
// =====================================================

async function updateProduct(req, res) {
  try {
    const { id } = req.params;
    const body = req.body || {};

    const sets = [];
    const values = [];
    const tambah = (kolom, nilai) => {
      sets.push(`${kolom} = ?`);
      values.push(nilai);
    };

    if (body.name !== undefined) {
      if (!String(body.name).trim()) {
        return res.status(400).json({ success: false, message: "Nama produk tidak boleh kosong." });
      }
      tambah("name", String(body.name).trim());
    }

    for (const [kunci, kolom] of [["price", "price"], ["stock", "stock"], ["max_stock", "max_stock"]]) {
      if (body[kunci] !== undefined) {
        const angka = angkaTidakNegatif(body[kunci]);
        if (angka === null) {
          return res.status(400).json({ success: false, message: `${kunci} harus berupa angka 0 atau lebih.` });
        }
        tambah(kolom, angka);
      }
    }

    for (const [kunci, kolom] of [["harga_coret", "harga_coret"], ["batas_stok_rendah", "batas_stok_rendah"]]) {
      if (body[kunci] !== undefined) {
        if (body[kunci] === "" || body[kunci] === null) tambah(kolom, null);
        else {
          const angka = angkaTidakNegatif(body[kunci]);
          if (angka === null) return res.status(400).json({ success: false, message: `${kunci} harus berupa angka 0 atau lebih.` });
          tambah(kolom, angka);
        }
      }
    }

    if (body.sumber !== undefined) {
      if (body.sumber && !SUMBER_VALID.includes(body.sumber)) {
        return res.status(400).json({ success: false, message: "Sumber harus Petani, UMKM, atau BUMDes." });
      }
      tambah("sumber", body.sumber || null);
    }

    if (body.detail !== undefined) {
      try {
        tambah("detail", parseDetail(body.detail) ?? null);
      } catch (e) {
        return res.status(400).json({ success: false, message: e.message });
      }
    }

    for (const kolom of ["description", "sku", "origin_block", "unit", "tag", "price_note", "ukuran", "penjual", "ketersediaan"]) {
      if (body[kolom] !== undefined) tambah(kolom, body[kolom] === "" ? null : body[kolom]);
    }

    if (body.category_id !== undefined) tambah("category_id", body.category_id || null);
    if (body.is_visible !== undefined) tambah("is_visible", parseBool(body.is_visible));

    if (req.file) {
      tambah("image", `${req.protocol}://${req.get("host")}/uploads/products/${req.file.filename}`);
    } else if (body.image !== undefined) {
      tambah("image", body.image || null);
    }

    if (!sets.length) {
      return res.status(400).json({ success: false, message: "Tidak ada perubahan yang dikirim." });
    }

    const [result] = await pool.execute(`UPDATE products SET ${sets.join(", ")} WHERE id = ?`, [...values, id]);

    if (!result.affectedRows) {
      return res.status(404).json({ success: false, message: "Produk tidak ditemukan." });
    }

    return res.json({ success: true, message: "Produk berhasil diperbarui." });
  } catch (error) {
    console.error("UPDATE PRODUCT ERROR:", error);
    return res.status(500).json({ success: false, message: "Gagal memperbarui produk." });
  }
}

// =====================================================
// DELETE PRODUCT
// =====================================================

async function deleteProduct(req, res) {
  try {
    const [result] = await pool.execute("DELETE FROM products WHERE id = ?", [req.params.id]);

    if (!result.affectedRows) {
      return res.status(404).json({ success: false, message: "Produk tidak ditemukan." });
    }

    return res.json({ success: true, message: "Produk berhasil dihapus." });
  } catch (error) {
    console.error("DELETE PRODUCT ERROR:", error);
    return res.status(500).json({ success: false, message: "Gagal menghapus produk." });
  }
}

module.exports = {
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
};
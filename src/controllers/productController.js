const {
  pool,
} = require("../config/database");


// =====================================================
// GET ALL PRODUCTS
// =====================================================

async function getProducts(
  req,
  res
) {
  try {
    const includeHidden = req.query.includeHidden === "true";
    const [products] = await pool.execute(
      `SELECT p.*, c.name AS category_name
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
      error:
        error.message,
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
        c.name AS category_name

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

    return res.json({
      success: true,
      data: products[0],
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message:
        "Gagal mengambil produk.",
      error:
        error.message,
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
    } = req.body;

    const userId =
      req.user?.id || null;

    if (
      !name ||
      price === undefined
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Nama dan harga produk wajib diisi.",
      });
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
        image, sku, origin_block, unit, max_stock, is_visible, tag, price_note
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        is_visible === undefined ? 1 : Number(Boolean(is_visible)),
        tag || null,
        price_note || null,
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
      error:
        error.message,
    });
  }
}


// =====================================================
// UPDATE PRODUCT
// =====================================================

async function updateProduct(
  req,
  res
) {
  try {
    const {
      id,
    } = req.params;

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
    } = req.body;

    let image = req.body.image || null;

    if (req.file) {
      image =
        `${req.protocol}://${req.get(
          "host"
        )}/uploads/products/${req.file.filename}`;
    }

    const fields = [
      name, description || "", Number(price), Number(stock || 0),
      category_id || null, image, sku || null, origin_block || null,
      unit || "kg", Number(max_stock || 0),
      is_visible === undefined ? 1 : Number(Boolean(is_visible)),
      tag || null, price_note || null, id
    ];
    await pool.execute(`
      UPDATE products SET
        name = ?, description = ?, price = ?, stock = ?, category_id = ?,
        image = COALESCE(?, image), sku = ?, origin_block = ?, unit = ?,
        max_stock = ?, is_visible = ?, tag = ?, price_note = ?
      WHERE id = ?
    `, fields);

    return res.json({
      success: true,
      message:
        "Produk berhasil diperbarui.",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message:
        "Gagal memperbarui produk.",
      error:
        error.message,
    });
  }
}


// =====================================================
// DELETE PRODUCT
// =====================================================

async function deleteProduct(
  req,
  res
) {
  try {
    const {
      id,
    } = req.params;

    await pool.execute(
      `
      DELETE FROM products
      WHERE id = ?
      `,
      [id]
    );

    return res.json({
      success: true,
      message:
        "Produk berhasil dihapus.",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message:
        "Gagal menghapus produk.",
      error:
        error.message,
    });
  }
}

module.exports = {
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
};
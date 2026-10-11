const { db } = require('../config/database');

async function getCart(req, res) {
  try {
    const [items] = await db.query(
      `
      SELECT
        c.id,
        c.product_id,
        c.quantity,
        p.name,
        p.price,
        p.image,
        (p.price * c.quantity) AS subtotal
      FROM carts c
      JOIN products p
        ON c.product_id = p.id
      WHERE c.user_id = ?
      ORDER BY c.id DESC
      `,
      [req.user.id]
    );

    res.json({
      success: true,
      data: items
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: 'Gagal mengambil keranjang'
    });
  }
}

async function addToCart(req, res) {
  try {
    const {
      product_id,
      quantity
    } = req.body;

    if (!product_id || !quantity) {
      return res.status(400).json({
        success: false,
        message: 'Produk dan quantity wajib diisi'
      });
    }

    const [existing] = await db.query(
      `SELECT id, quantity
       FROM carts
       WHERE user_id = ? AND product_id = ?`,
      [
        req.user.id,
        product_id
      ]
    );

    if (existing.length > 0) {
      await db.query(
        `UPDATE carts
         SET quantity = quantity + ?
         WHERE id = ?`,
        [
          quantity,
          existing[0].id
        ]
      );
    } else {
      await db.query(
        `INSERT INTO carts
         (user_id, product_id, quantity)
         VALUES (?, ?, ?)`,
        [
          req.user.id,
          product_id,
          quantity
        ]
      );
    }

    res.json({
      success: true,
      message: 'Produk berhasil ditambahkan ke keranjang'
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: 'Gagal menambahkan produk ke keranjang'
    });
  }
}

async function updateCart(req, res) {
  try {
    const { id } = req.params;
    const { quantity } = req.body;

    if (!quantity || quantity < 1) {
      return res.status(400).json({
        success: false,
        message: 'Quantity tidak valid'
      });
    }

    await db.query(
      `UPDATE carts
       SET quantity = ?
       WHERE id = ? AND user_id = ?`,
      [
        quantity,
        id,
        req.user.id
      ]
    );

    res.json({
      success: true,
      message: 'Keranjang berhasil diperbarui'
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: 'Gagal memperbarui keranjang'
    });
  }
}

async function deleteCart(req, res) {
  try {
    const { id } = req.params;

    await db.query(
      `DELETE FROM carts
       WHERE id = ? AND user_id = ?`,
      [
        id,
        req.user.id
      ]
    );

    res.json({
      success: true,
      message: 'Produk berhasil dihapus dari keranjang'
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: 'Gagal menghapus produk'
    });
  }
}

module.exports = {
  getCart,
  addToCart,
  updateCart,
  deleteCart
};
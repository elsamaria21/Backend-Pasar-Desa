const { db } = require('../config/database');

async function getOrders(req, res) {
  try {
    const [orders] = await db.query(
      `
      SELECT *
      FROM orders
      WHERE user_id = ?
      ORDER BY id DESC
      `,
      [req.user.id]
    );

    res.json({
      success: true,
      data: orders
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: 'Gagal mengambil pesanan'
    });
  }
}

async function getOrderById(req, res) {
  try {
    const { id } = req.params;

    const [orders] = await db.query(
      `
      SELECT *
      FROM orders
      WHERE id = ? AND user_id = ?
      `,
      [
        id,
        req.user.id
      ]
    );

    if (orders.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Pesanan tidak ditemukan'
      });
    }

    const [details] = await db.query(
      `
      SELECT
        od.*,
        p.name,
        p.image
      FROM order_details od
      JOIN products p
        ON od.product_id = p.id
      WHERE od.order_id = ?
      `,
      [id]
    );

    res.json({
      success: true,
      data: {
        order: orders[0],
        details
      }
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: 'Gagal mengambil detail pesanan'
    });
  }
}

async function createOrder(req, res) {
  const connection = await db.getConnection();

  try {
    const {
      items,
      address,
      payment_method
    } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Item pesanan tidak boleh kosong'
      });
    }

    await connection.beginTransaction();

    let total = 0;

    for (const item of items) {
      const [products] = await connection.query(
        'SELECT * FROM products WHERE id = ?',
        [item.product_id]
      );

      if (products.length === 0) {
        throw new Error(
          `Produk ${item.product_id} tidak ditemukan`
        );
      }

      const product = products[0];

      if (product.stock < item.quantity) {
        throw new Error(
          `Stock ${product.name} tidak mencukupi`
        );
      }

      total +=
        Number(product.price) *
        Number(item.quantity);
    }

    const [orderResult] = await connection.query(
      `
      INSERT INTO orders
      (user_id, total, address, payment_method, status)
      VALUES (?, ?, ?, ?, ?)
      `,
      [
        req.user.id,
        total,
        address || null,
        payment_method || null,
        'pending'
      ]
    );

    const orderId = orderResult.insertId;

    for (const item of items) {
      const [products] = await connection.query(
        'SELECT * FROM products WHERE id = ?',
        [item.product_id]
      );

      const product = products[0];

      await connection.query(
        `
        INSERT INTO order_details
        (order_id, product_id, quantity, price)
        VALUES (?, ?, ?, ?)
        `,
        [
          orderId,
          item.product_id,
          item.quantity,
          product.price
        ]
      );

      await connection.query(
        `
        UPDATE products
        SET stock = stock - ?
        WHERE id = ?
        `,
        [
          item.quantity,
          item.product_id
        ]
      );
    }

    await connection.commit();

    res.status(201).json({
      success: true,
      message: 'Pesanan berhasil dibuat',
      order_id: orderId,
      total
    });
  } catch (error) {
    await connection.rollback();

    console.error(error);

    res.status(500).json({
      success: false,
      message: error.message || 'Gagal membuat pesanan'
    });
  } finally {
    connection.release();
  }
}

async function updateOrderStatus(req, res) {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const allowedStatus = [
      'pending',
      'diproses',
      'dikirim',
      'selesai',
      'dibatalkan'
    ];

    if (!allowedStatus.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Status pesanan tidak valid'
      });
    }

    await db.query(
      `
      UPDATE orders
      SET status = ?
      WHERE id = ?
      `,
      [
        status,
        id
      ]
    );

    res.json({
      success: true,
      message: 'Status pesanan berhasil diperbarui'
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: 'Gagal memperbarui status pesanan'
    });
  }
}

module.exports = {
  getOrders,
  getOrderById,
  createOrder,
  updateOrderStatus
};
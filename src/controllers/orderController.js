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
  const { items, address, payment_method } = req.body || {};

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, message: 'Item pesanan tidak boleh kosong' });
  }

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    let total = 0;
    const lines = [];
    const stokTersisa = new Map(); // produk yang sama di beberapa baris dihitung kumulatif

    for (const item of items) {
      const quantity = Number(item.quantity);

      if (!Number.isFinite(quantity) || quantity <= 0) {
        throw new Error('Jumlah item harus lebih dari 0');
      }

      // FOR UPDATE: mengunci baris produk sampai transaksi selesai, mencegah stok terjual ganda.
      const [products] = await connection.query(
        'SELECT id, name, price, stock, is_visible FROM products WHERE id = ? FOR UPDATE',
        [item.product_id]
      );

      if (products.length === 0) {
        throw new Error(`Produk ${item.product_id} tidak ditemukan`);
      }

      const product = products[0];

      if (!product.is_visible) {
        throw new Error(`Produk ${product.name} tidak tersedia`);
      }

      const sisa = stokTersisa.has(product.id) ? stokTersisa.get(product.id) : Number(product.stock);

      if (sisa < quantity) {
        throw new Error(`Stock ${product.name} tidak mencukupi`);
      }

      stokTersisa.set(product.id, sisa - quantity);
      total += Number(product.price) * quantity;
      lines.push({ productId: product.id, quantity, price: product.price });
    }

    const [orderResult] = await connection.query(
      'INSERT INTO orders (user_id, total, address, payment_method, status) VALUES (?, ?, ?, ?, ?)',
      [req.user.id, total, address || null, payment_method || null, 'pending']
    );

    const orderId = orderResult.insertId;

    for (const line of lines) {
      await connection.query(
        'INSERT INTO order_details (order_id, product_id, quantity, price) VALUES (?, ?, ?, ?)',
        [orderId, line.productId, line.quantity, line.price]
      );

      await connection.query('UPDATE products SET stock = stock - ? WHERE id = ?', [line.quantity, line.productId]);
    }

    await connection.commit();

    res.status(201).json({ success: true, message: 'Pesanan berhasil dibuat', order_id: orderId, total });
  } catch (error) {
    await connection.rollback();
    console.error(error);
    res.status(400).json({ success: false, message: error.message || 'Gagal membuat pesanan' });
  } finally {
    connection.release();
  }
}

// Khusus admin (dijaga di route). Pembatalan mengembalikan stok; pesanan batal tidak bisa dihidupkan lagi.
async function updateOrderStatus(req, res) {
  const { id } = req.params;
  const { status } = req.body || {};
  const allowedStatus = ['pending', 'diproses', 'dikirim', 'selesai', 'dibatalkan'];

  if (!allowedStatus.includes(status)) {
    return res.status(400).json({ success: false, message: 'Status pesanan tidak valid' });
  }

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [rows] = await connection.query('SELECT status FROM orders WHERE id = ? FOR UPDATE', [id]);

    if (rows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Pesanan tidak ditemukan' });
    }

    if (rows[0].status === 'dibatalkan' && status !== 'dibatalkan') {
      await connection.rollback();
      return res.status(409).json({ success: false, message: 'Pesanan yang dibatalkan tidak bisa diaktifkan lagi' });
    }

    await connection.query('UPDATE orders SET status = ? WHERE id = ?', [status, id]);

    if (status === 'dibatalkan' && rows[0].status !== 'dibatalkan') {
      const [details] = await connection.query('SELECT product_id, quantity FROM order_details WHERE order_id = ?', [id]);

      for (const d of details) {
        await connection.query('UPDATE products SET stock = stock + ? WHERE id = ?', [d.quantity, d.product_id]);
      }
    }

    await connection.commit();

    res.json({ success: true, message: 'Status pesanan berhasil diperbarui' });
  } catch (error) {
    await connection.rollback();
    console.error(error);
    res.status(500).json({ success: false, message: 'Gagal memperbarui status pesanan' });
  } finally {
    connection.release();
  }
}

module.exports = {
  getOrders,
  getOrderById,
  createOrder,
  updateOrderStatus
};
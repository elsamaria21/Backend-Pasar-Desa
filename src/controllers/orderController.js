const { db } = require('../config/database');

const DELIVERY_FEE = 5000;
const VOUCHER_CODE = 'PANENRAYA';
const VOUCHER_DISCOUNT = 5000;

function makeOrderCode(id) {
  return `PD-${String(id).padStart(6, '0')}`;
}

function firstValue(source, keys, fallback = null) {
  for (const key of keys) {
    const value = source?.[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return fallback;
}

function orderCodeFromRow(row) {
  return String(
    firstValue(row, ['order_code', 'kode', 'code'], makeOrderCode(row.id))
  );
}

function normalizeOrderRow(row, items = [], user = {}) {
  return {
    ...row,
    id: Number(row.id),
    order_id: Number(row.id),
    order_code: orderCodeFromRow(row),
    created_at: firstValue(row, ['created_at', 'createdAt'], null),
    customer_name: firstValue(
      row,
      ['customer_name', 'receiver_name', 'pembeli'],
      firstValue(user, ['name', 'nama'], '')
    ),
    phone: firstValue(
      row,
      ['phone', 'receiver_phone', 'telepon'],
      firstValue(user, ['phone', 'telepon'], '')
    ),
    delivery_option: firstValue(
      row,
      ['delivery_option', 'delivery', 'opsi_pengiriman'],
      ''
    ),
    notes: firstValue(row, ['notes', 'note', 'catatan'], ''),
    landmark: firstValue(row, ['landmark', 'patokan'], ''),
    items,
  };
}

async function getOrderItems(orderIds) {
  if (!orderIds.length) return [];

  const [details] = await db.query(
    `
    SELECT
      od.order_id,
      od.product_id,
      od.quantity,
      od.price,
      p.name AS product_name,
      p.image AS image
    FROM order_details od
    LEFT JOIN products p ON p.id = od.product_id
    WHERE od.order_id IN (?)
    ORDER BY od.order_id DESC
    `,
    [orderIds]
  );

  return details;
}

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

    const orderIds = orders.map((order) => Number(order.id));
    const details = await getOrderItems(orderIds);
    const itemsByOrder = new Map();

    for (const item of details) {
      const key = Number(item.order_id);
      if (!itemsByOrder.has(key)) itemsByOrder.set(key, []);
      itemsByOrder.get(key).push(item);
    }

    const data = orders.map((order) =>
      normalizeOrderRow(
        order,
        itemsByOrder.get(Number(order.id)) || [],
        req.user
      )
    );

    return res.json({ success: true, data });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: 'Gagal mengambil pesanan',
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
      [id, req.user.id]
    );

    if (orders.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Pesanan tidak ditemukan',
      });
    }

    const details = await getOrderItems([Number(id)]);

    return res.json({
      success: true,
      data: {
        order: normalizeOrderRow(orders[0], details, req.user),
        details,
      },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: 'Gagal mengambil detail pesanan',
    });
  }
}

async function readOrderColumns(connection) {
  try {
    const [rows] = await connection.query('SHOW COLUMNS FROM orders');
    return new Set(rows.map((row) => String(row.Field)));
  } catch (error) {
    // Fallback ke kolom inti bila akun database tidak memiliki izin SHOW.
    console.warn('Tidak dapat membaca kolom opsional tabel orders:', error.message);
    return new Set([
      'user_id',
      'total',
      'address',
      'payment_method',
      'status',
    ]);
  }
}

function addFirstAvailableColumn(columns, values, candidates, value) {
  const column = candidates.find((candidate) => columns.has(candidate));
  if (column && !Object.prototype.hasOwnProperty.call(values, column)) {
    values[column] = value;
  }
}

async function createOrder(req, res) {
  const body = req.body || {};
  const items = body.items;
  const address = firstValue(body, ['address', 'alamat'], null);
  const paymentMethod = firstValue(
    body,
    ['payment_method', 'metodeBayar'],
    null
  );
  const receiverName = firstValue(
    body,
    ['receiver_name', 'receiverName', 'pembeli'],
    ''
  );
  const receiverPhone = firstValue(
    body,
    ['receiver_phone', 'receiverPhone', 'telepon'],
    ''
  );
  const delivery = String(
    firstValue(
      body,
      ['delivery_option', 'delivery', 'opsiPengiriman'],
      'ambil-mandiri'
    )
  );
  const landmark = String(firstValue(body, ['landmark', 'patokan'], '') || '');
  const note = String(firstValue(body, ['note', 'notes', 'catatan'], '') || '');
  const voucherCode = String(
    firstValue(body, ['voucher_code', 'voucherCode'], '') || ''
  )
    .trim()
    .toUpperCase();

  if (!req.user?.id) {
    return res.status(401).json({
      success: false,
      message: 'Sesi pengguna tidak valid. Silakan login kembali.',
    });
  }

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Item pesanan tidak boleh kosong',
    });
  }

  if (!paymentMethod) {
    return res.status(400).json({
      success: false,
      message: 'Metode pembayaran belum dipilih',
    });
  }

  if (!['kurir-desa', 'ambil-mandiri'].includes(delivery)) {
    return res.status(400).json({
      success: false,
      message: 'Opsi pengiriman tidak valid',
    });
  }

  const connection = await db.getConnection();
  let transactionStarted = false;

  try {
    await connection.beginTransaction();
    transactionStarted = true;

    let subtotal = 0;
    const lines = [];
    const remainingStock = new Map();

    for (const item of items) {
      const rawProductId = firstValue(item, ['product_id', 'productId', 'id']);
      const productId = Number(rawProductId);
      const quantity = Number(firstValue(item, ['quantity', 'jumlah']));

      if (!Number.isInteger(productId) || productId <= 0) {
        throw new Error('ID produk tidak valid');
      }

      if (!Number.isInteger(quantity) || quantity <= 0) {
        throw new Error('Jumlah item harus berupa bilangan bulat lebih dari 0');
      }

      const [products] = await connection.query(
        `
        SELECT id, name, price, stock, is_visible
        FROM products
        WHERE id = ?
        FOR UPDATE
        `,
        [productId]
      );

      if (products.length === 0) {
        throw new Error(`Produk ${productId} tidak ditemukan`);
      }

      const product = products[0];
      if (
        product.is_visible !== undefined &&
        product.is_visible !== null &&
        Number(product.is_visible) !== 1 &&
        product.is_visible !== true
      ) {
        throw new Error(`Produk ${product.name} tidak tersedia`);
      }

      const currentStock = remainingStock.has(product.id)
        ? remainingStock.get(product.id)
        : Number(product.stock);

      if (!Number.isFinite(currentStock) || currentStock < quantity) {
        throw new Error(`Stok ${product.name} tidak mencukupi`);
      }

      remainingStock.set(product.id, currentStock - quantity);

      const price = Number(product.price);
      if (!Number.isFinite(price) || price < 0) {
        throw new Error(`Harga produk ${product.name} tidak valid`);
      }

      subtotal += price * quantity;
      lines.push({
        productId: product.id,
        quantity,
        price: product.price,
      });
    }

    // Ongkir dan voucher dihitung ulang di server; total dari aplikasi tidak dipercaya.
    const deliveryFee = delivery === 'kurir-desa' ? DELIVERY_FEE : 0;
    const discount =
      delivery === 'kurir-desa' && voucherCode === VOUCHER_CODE
        ? Math.min(deliveryFee, VOUCHER_DISCOUNT)
        : 0;
    const total = Math.max(0, Math.round(subtotal + deliveryFee - discount));

    const columns = await readOrderColumns(connection);
    const orderValues = {
      user_id: req.user.id,
      total,
      address: address || null,
      payment_method: paymentMethod,
      status: 'pending',
    };

    // Simpan metadata tambahan hanya jika kolomnya memang sudah tersedia.
    addFirstAvailableColumn(
      columns,
      orderValues,
      ['customer_name', 'receiver_name', 'pembeli'],
      receiverName
    );
    addFirstAvailableColumn(
      columns,
      orderValues,
      ['phone', 'receiver_phone', 'telepon'],
      receiverPhone
    );
    addFirstAvailableColumn(
      columns,
      orderValues,
      ['delivery_option', 'delivery', 'opsi_pengiriman'],
      delivery
    );
    addFirstAvailableColumn(
      columns,
      orderValues,
      ['landmark', 'patokan'],
      landmark
    );
    addFirstAvailableColumn(
      columns,
      orderValues,
      ['notes', 'note', 'catatan'],
      note
    );
    addFirstAvailableColumn(
      columns,
      orderValues,
      ['subtotal'],
      Math.round(subtotal)
    );
    addFirstAvailableColumn(
      columns,
      orderValues,
      ['delivery_fee', 'shipping_fee', 'ongkir'],
      deliveryFee
    );
    addFirstAvailableColumn(
      columns,
      orderValues,
      ['discount', 'discount_amount', 'diskon'],
      discount
    );
    addFirstAvailableColumn(
      columns,
      orderValues,
      ['voucher_code', 'voucher'],
      voucherCode || null
    );

    const orderColumns = Object.keys(orderValues);
    const placeholders = orderColumns.map(() => '?').join(', ');
    const columnSql = orderColumns.map((column) => `\`${column}\``).join(', ');
    const valuesSql = orderColumns.map((column) => orderValues[column]);

    const [orderResult] = await connection.query(
      `INSERT INTO orders (${columnSql}) VALUES (${placeholders})`,
      valuesSql
    );

    const orderId = Number(orderResult.insertId);
    if (!Number.isInteger(orderId) || orderId <= 0) {
      throw new Error('Server tidak menerima ID pesanan yang valid');
    }

    for (const line of lines) {
      await connection.query(
        `
        INSERT INTO order_details (order_id, product_id, quantity, price)
        VALUES (?, ?, ?, ?)
        `,
        [orderId, line.productId, line.quantity, line.price]
      );

      await connection.query(
        'UPDATE products SET stock = stock - ? WHERE id = ?',
        [line.quantity, line.productId]
      );
    }

    await connection.commit();
    transactionStarted = false;

    // Log diagnosa: pastikan server yang berjalan memakai versi kode ini.
    console.log(
      '[createOrder] delivery=%s subtotal=%s fee=%s discount=%s total=%s',
      delivery,
      Math.round(subtotal),
      deliveryFee,
      discount,
      total
    );

    return res.status(201).json({
      success: true,
      message: 'Pesanan berhasil dibuat',
      data: {
        id: orderId,
        kode: makeOrderCode(orderId),
        total,
        subtotal: Math.round(subtotal),
        delivery_fee: deliveryFee,
        discount,
        status: 'pending',
      },
    });
  } catch (error) {
    if (transactionStarted) {
      await connection.rollback();
    }
    console.error(error);
    return res.status(400).json({
      success: false,
      message: error.message || 'Gagal membuat pesanan',
    });
  } finally {
    connection.release();
  }
}

// Admin dapat memperbarui status. Pembeli hanya dapat membatalkan pesanan miliknya
// selama status masih pending. Stok dikembalikan tepat satu kali.
async function updateOrderStatus(req, res) {
  const { id } = req.params;
  const { status } = req.body || {};
  const allowedStatus = [
    'pending',
    'diproses',
    'dikirim',
    'selesai',
    'dibatalkan',
  ];

  if (!allowedStatus.includes(status)) {
    return res.status(400).json({
      success: false,
      message: 'Status pesanan tidak valid',
    });
  }

  if (!req.user?.id) {
    return res.status(401).json({
      success: false,
      message: 'Sesi pengguna tidak valid. Silakan login kembali.',
    });
  }

  const role = String(
    req.user.role || req.user.role_name || req.user.userRole || ''
  ).toLowerCase();
  const isAdmin =
    req.user.is_admin === true ||
    req.user.isAdmin === true ||
    ['admin', 'administrator', 'superadmin'].includes(role);

  const connection = await db.getConnection();
  let transactionStarted = false;

  try {
    await connection.beginTransaction();
    transactionStarted = true;

    const [rows] = await connection.query(
      'SELECT id, user_id, status FROM orders WHERE id = ? FOR UPDATE',
      [id]
    );

    if (rows.length === 0) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(404).json({
        success: false,
        message: 'Pesanan tidak ditemukan',
      });
    }

    const order = rows[0];

    if (!isAdmin) {
      if (Number(order.user_id) !== Number(req.user.id)) {
        await connection.rollback();
        transactionStarted = false;
        return res.status(403).json({
          success: false,
          message: 'Anda tidak memiliki akses ke pesanan ini',
        });
      }

      if (status !== 'dibatalkan') {
        await connection.rollback();
        transactionStarted = false;
        return res.status(403).json({
          success: false,
          message: 'Pembeli hanya dapat membatalkan pesanan',
        });
      }

      if (order.status !== 'pending' && order.status !== 'dibatalkan') {
        await connection.rollback();
        transactionStarted = false;
        return res.status(409).json({
          success: false,
          message: 'Pesanan tidak dapat dibatalkan karena sudah diproses',
        });
      }
    }

    if (order.status === 'dibatalkan' && status !== 'dibatalkan') {
      await connection.rollback();
      transactionStarted = false;
      return res.status(409).json({
        success: false,
        message: 'Pesanan yang dibatalkan tidak bisa diaktifkan lagi',
      });
    }

    await connection.query('UPDATE orders SET status = ? WHERE id = ?', [
      status,
      id,
    ]);

    if (status === 'dibatalkan' && order.status !== 'dibatalkan') {
      const [details] = await connection.query(
        'SELECT product_id, quantity FROM order_details WHERE order_id = ?',
        [id]
      );

      for (const detail of details) {
        await connection.query(
          'UPDATE products SET stock = stock + ? WHERE id = ?',
          [detail.quantity, detail.product_id]
        );
      }
    }

    await connection.commit();
    transactionStarted = false;

    return res.json({
      success: true,
      message: 'Status pesanan berhasil diperbarui',
      data: { id: Number(id), status },
    });
  } catch (error) {
    if (transactionStarted) {
      await connection.rollback();
    }
    console.error(error);
    return res.status(500).json({
      success: false,
      message: 'Gagal memperbarui status pesanan',
    });
  } finally {
    connection.release();
  }
}

module.exports = {
  getOrders,
  getOrderById,
  createOrder,
  updateOrderStatus,
};
const { pool } = require("../config/database");

const STATUS = new Set(["pending", "perlu-dikemas", "diproses", "siap-jemput", "sedang-dikemas", "dikirim", "selesai", "dibatalkan"]);

async function listOrders(req, res) {
  try {
    const [rows] = await pool.query(`
      SELECT id, order_code AS kode, user_id AS userId, customer_name AS pembeli,
        address AS alamat, drop_point AS dropPoint, payment_method AS metodeBayar,
        phone AS telepon, notes AS catatan, status, total, created_at AS dibuatPada
      FROM dashboard_orders ORDER BY created_at DESC, id DESC
    `);
    for (const row of rows) {
      const [items] = await pool.query(`
        SELECT product_id AS productId, product_name AS komoditas, quantity AS jumlah,
          unit AS satuan, unit_price AS hargaSatuan, subtotal, tag
        FROM dashboard_order_items WHERE order_id = ? ORDER BY id
      `, [row.id]);
      row.items = items;
    }
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error("ADMIN LIST ORDERS:", error);
    res.status(500).json({ success: false, message: "Gagal mengambil pesanan." });
  }
}

async function createOrder(req, res) {
  const body = req.body || {};
  const items = Array.isArray(body.items) ? body.items : [];
  if (!body.pembeli && !body.customer_name && !(body.userId || body.user_id)) return res.status(400).json({ success: false, message: "Nama pembeli atau userId wajib diisi." });
  if (!items.length) return res.status(400).json({ success: false, message: "Minimal satu item pesanan wajib diisi." });
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    let total = 0;
    const normalized = [];
    for (const item of items) {
      const productId = item.productId || item.product_id || null;
      let product = null;
      if (productId) {
        const [products] = await connection.query("SELECT id, name, price, stock, unit, tag FROM products WHERE id = ? FOR UPDATE", [productId]);
        if (!products.length) throw new Error(`Produk ${productId} tidak ditemukan.`);
        product = products[0];
      }
      const quantity = Number(item.jumlah ?? item.quantity);
      const price = Number(item.hargaSatuan ?? item.unit_price ?? product?.price ?? 0);
      if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(price) || price < 0) throw new Error("Jumlah dan harga item tidak valid.");
      if (product && product.stock < quantity) throw new Error(`Stok ${product.name} tidak mencukupi.`);
      const subtotal = quantity * price;
      total += subtotal;
      normalized.push({ productId: product?.id || null, name: item.komoditas || item.product_name || product?.name || "Komoditas", quantity, unit: item.satuan || item.unit || product?.unit || "kg", price, subtotal, tag: item.tag || product?.tag || null });
    }
    const orderCode = body.kode || body.order_code || `PSD-${Date.now()}`;
    const status = STATUS.has(body.status) ? body.status : "pending";
    let customerName = body.pembeli || body.customer_name;
    const userId = body.userId || body.user_id || null;
    if (!customerName && userId) {
      const [users] = await connection.query("SELECT name FROM users WHERE id = ? LIMIT 1", [userId]);
      customerName = users[0]?.name || "Pengguna Mobile";
    }
    const [result] = await connection.query(`
      INSERT INTO dashboard_orders
      (order_code, user_id, customer_name, address, drop_point, payment_method, phone, notes, status, total)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [orderCode, userId, customerName, body.alamat || body.address || null,
      body.dropPoint || body.drop_point || null, body.metodeBayar || body.payment_method || null, body.telepon || body.phone || null,
      body.catatan || body.notes || null, status, total]);
    for (const item of normalized) {
      await connection.query(`
        INSERT INTO dashboard_order_items (order_id, product_id, product_name, quantity, unit, unit_price, subtotal, tag)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [result.insertId, item.productId, item.name, item.quantity, item.unit, item.price, item.subtotal, item.tag]);
      if (item.productId) await connection.query("UPDATE products SET stock = stock - ? WHERE id = ?", [item.quantity, item.productId]);
    }
    await connection.commit();
    res.status(201).json({ success: true, message: "Pesanan berhasil dibuat.", data: { id: result.insertId, kode: orderCode, total, status } });
  } catch (error) {
    await connection.rollback();
    res.status(400).json({ success: false, message: error.message || "Gagal membuat pesanan." });
  } finally { connection.release(); }
}

async function updateOrder(req, res) {
  const { id } = req.params;
  const body = req.body || {};
  const fields = [];
  const values = [];
  const map = { pembeli: "customer_name", alamat: "address", dropPoint: "drop_point", metodeBayar: "payment_method", telepon: "phone", catatan: "notes", total: "total" };
  for (const [key, column] of Object.entries(map)) if (body[key] !== undefined) { fields.push(`${column} = ?`); values.push(body[key]); }
  if (body.status !== undefined) {
    if (!STATUS.has(body.status)) return res.status(400).json({ success: false, message: "Status pesanan tidak valid." });
    fields.push("status = ?"); values.push(body.status);
  }
  if (!fields.length) return res.status(400).json({ success: false, message: "Tidak ada perubahan yang dikirim." });
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [beforeRows] = await connection.query("SELECT status, total, order_code FROM dashboard_orders WHERE id = ? FOR UPDATE", [id]);
    if (!beforeRows.length) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: "Pesanan tidak ditemukan." });
    }
    values.push(id);
    await connection.query(`UPDATE dashboard_orders SET ${fields.join(", ")} WHERE id = ?`, values);
    if (body.status === "selesai" && beforeRows[0].status !== "selesai") {
      const reference = `PESANAN-${id}`;
      const [existing] = await connection.query("SELECT id FROM dashboard_cash_transactions WHERE reference_code = ? LIMIT 1", [reference]);
      if (!existing.length) {
        const [currentRows] = await connection.query("SELECT total FROM dashboard_orders WHERE id = ?", [id]);
        await connection.query(
          "INSERT INTO dashboard_cash_transactions (type, category, description, amount, reference_code) VALUES ('credit', 'penjualan', ?, ?, ?)",
          [`Penjualan pesanan ${beforeRows[0].order_code}`, Number(currentRows[0].total || 0), reference]
        );
      }
    }
    await connection.commit();
    res.json({ success: true, message: "Pesanan diperbarui." });
  } catch (error) {
    await connection.rollback();
    res.status(500).json({ success: false, message: "Gagal memperbarui pesanan." });
  } finally { connection.release(); }
}

async function deleteOrder(req, res) {
  try {
    const [result] = await pool.query("DELETE FROM dashboard_orders WHERE id = ?", [req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ success: false, message: "Pesanan tidak ditemukan." });
    res.json({ success: true, message: "Pesanan dihapus." });
  } catch (error) { res.status(500).json({ success: false, message: "Gagal menghapus pesanan." }); }
}

module.exports = { listOrders, createOrder, updateOrder, deleteOrder };

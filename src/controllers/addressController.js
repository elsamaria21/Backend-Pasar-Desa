
const { db } = require("../config/database");

// ==========================================
// GET SEMUA ALAMAT PENGGUNA
// ==========================================

async function getAddresses(req, res) {
  try {
    const [addresses] = await db.query(
      `SELECT
        id,
        user_id,
        recipient_name,
        phone,
        label,
        dusun,
        rt_rw,
        full_address,
        address_note,
        latitude,
        longitude,
        is_primary,
        created_at,
        updated_at
      FROM user_addresses
      WHERE user_id = ?
      ORDER BY is_primary DESC, created_at DESC`,
      [req.user.id]
    );

    return res.json({
      success: true,
      total: addresses.length,
      maxAddress: 4,
      remaining: 4 - addresses.length,
      data: addresses
    });

  } catch (error) {
    console.error("Get addresses error:", error);

    return res.status(500).json({
      success: false,
      message: "Gagal mengambil alamat."
    });
  }
}

// ==========================================
// TAMBAH ALAMAT
// ==========================================

async function addAddress(req, res) {
  let connection;

  try {
    const {
      recipient_name,
      phone,
      label,
      dusun,
      rt_rw,
      full_address,
      address_note,
      latitude,
      longitude,
      is_primary
    } = req.body;

    // Validasi data wajib
    if (
      !recipient_name ||
      !phone ||
      !full_address
    ) {
      return res.status(400).json({
        success: false,
        message: "Nama penerima, nomor telepon, dan alamat wajib diisi."
      });
    }

    // Validasi label
    const allowedLabels = [
      "Rumah",
      "Toko/Lapak",
      "Kantor Desa",
      "Lainnya"
    ];

    if (label && !allowedLabels.includes(label)) {
      return res.status(400).json({
        success: false,
        message: "Label alamat tidak valid."
      });
    }

    // Validasi koordinat
    if (
      (latitude != null && !Number.isFinite(Number(latitude))) ||
      (longitude != null && !Number.isFinite(Number(longitude)))
    ) {
      return res.status(400).json({
        success: false,
        message: "Koordinat Maps tidak valid."
      });
    }

    if ((latitude == null) !== (longitude == null)) {
      return res.status(400).json({
        success: false,
        message: "Latitude dan longitude harus diisi bersamaan."
      });
    }

    if (
      latitude != null &&
      (Number(latitude) < -90 || Number(latitude) > 90)
    ) {
      return res.status(400).json({
        success: false,
        message: "Latitude tidak valid."
      });
    }

    if (
      longitude != null &&
      (Number(longitude) < -180 || Number(longitude) > 180)
    ) {
      return res.status(400).json({
        success: false,
        message: "Longitude tidak valid."
      });
    }

    connection = await db.getConnection();

    await connection.beginTransaction();

    // Kunci data user untuk mencegah penambahan
    // alamat bersamaan melewati batas maksimal 4.
    const [users] = await connection.query(
      "SELECT id FROM users WHERE id = ? FOR UPDATE",
      [req.user.id]
    );

    if (users.length === 0) {
      await connection.rollback();

      return res.status(404).json({
        success: false,
        message: "Pengguna tidak ditemukan."
      });
    }

    const [existing] = await connection.query(
      `SELECT COUNT(*) AS total
       FROM user_addresses
       WHERE user_id = ?`,
      [req.user.id]
    );

    const total = Number(existing[0].total);

    if (total >= 4) {
      await connection.rollback();

      return res.status(400).json({
        success: false,
        message: "Maksimal hanya boleh menyimpan 4 alamat."
      });
    }

    // Alamat pertama otomatis menjadi alamat utama.
    const makePrimary =
      is_primary === true ||
      is_primary === 1 ||
      total === 0;

    if (makePrimary) {
      await connection.query(
        `UPDATE user_addresses
         SET is_primary = 0
         WHERE user_id = ?`,
        [req.user.id]
      );
    }

    const [result] = await connection.query(
      `INSERT INTO user_addresses (
        user_id,
        recipient_name,
        phone,
        label,
        dusun,
        rt_rw,
        full_address,
        address_note,
        latitude,
        longitude,
        is_primary
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user.id,
        recipient_name,
        phone,
        label || "Rumah",
        dusun || null,
        rt_rw || null,
        full_address,
        address_note || null,
        latitude ?? null,
        longitude ?? null,
        makePrimary ? 1 : 0
      ]
    );

    await connection.commit();

    return res.status(201).json({
      success: true,
      message: "Alamat berhasil ditambahkan.",
      data: {
        id: result.insertId,
        maxAddress: 4
      }
    });

  } catch (error) {
    if (connection) {
      await connection.rollback();
    }

    console.error("Add address error:", error);

    return res.status(500).json({
      success: false,
      message: "Gagal menambahkan alamat."
    });

  } finally {
    if (connection) {
      connection.release();
    }
  }
}

// ==========================================
// EDIT ALAMAT
// ==========================================

async function updateAddress(req, res) {
  let connection;

  try {
    const { id } = req.params;

    const {
      recipient_name,
      phone,
      label,
      dusun,
      rt_rw,
      full_address,
      address_note,
      latitude,
      longitude
    } = req.body;

    if (
      !recipient_name ||
      !phone ||
      !full_address
    ) {
      return res.status(400).json({
        success: false,
        message: "Nama penerima, nomor telepon, dan alamat wajib diisi."
      });
    }

    const allowedLabels = [
      "Rumah",
      "Toko/Lapak",
      "Kantor Desa",
      "Lainnya"
    ];

    if (label && !allowedLabels.includes(label)) {
      return res.status(400).json({
        success: false,
        message: "Label alamat tidak valid."
      });
    }

    if (
      (latitude != null && !Number.isFinite(Number(latitude))) ||
      (longitude != null && !Number.isFinite(Number(longitude))) ||
      ((latitude == null) !== (longitude == null))
    ) {
      return res.status(400).json({
        success: false,
        message: "Koordinat Maps tidak valid."
      });
    }

    if (
      latitude != null &&
      (Number(latitude) < -90 || Number(latitude) > 90)
    ) {
      return res.status(400).json({
        success: false,
        message: "Latitude tidak valid."
      });
    }

    if (
      longitude != null &&
      (Number(longitude) < -180 || Number(longitude) > 180)
    ) {
      return res.status(400).json({
        success: false,
        message: "Longitude tidak valid."
      });
    }

    connection = await db.getConnection();

    await connection.beginTransaction();

    await connection.query(
      "SELECT id FROM users WHERE id = ? FOR UPDATE",
      [req.user.id]
    );

    const [addresses] = await connection.query(
      `SELECT id
       FROM user_addresses
       WHERE id = ? AND user_id = ?`,
      [id, req.user.id]
    );

    if (addresses.length === 0) {
      await connection.rollback();

      return res.status(404).json({
        success: false,
        message: "Alamat tidak ditemukan."
      });
    }

    await connection.query(
      `UPDATE user_addresses SET
        recipient_name = ?,
        phone = ?,
        label = ?,
        dusun = ?,
        rt_rw = ?,
        full_address = ?,
        address_note = ?,
        latitude = ?,
        longitude = ?
      WHERE id = ? AND user_id = ?`,
      [
        recipient_name,
        phone,
        label || "Rumah",
        dusun || null,
        rt_rw || null,
        full_address,
        address_note || null,
        latitude ?? null,
        longitude ?? null,
        id,
        req.user.id
      ]
    );

    await connection.commit();

    return res.json({
      success: true,
      message: "Alamat berhasil diperbarui."
    });

  } catch (error) {
    if (connection) {
      await connection.rollback();
    }

    console.error("Update address error:", error);

    return res.status(500).json({
      success: false,
      message: "Gagal memperbarui alamat."
    });

  } finally {
    if (connection) {
      connection.release();
    }
  }
}

// ==========================================
// PILIH ALAMAT UTAMA
// ==========================================

async function setPrimaryAddress(req, res) {
  let connection;

  try {
    connection = await db.getConnection();

    await connection.beginTransaction();

    await connection.query(
      "SELECT id FROM users WHERE id = ? FOR UPDATE",
      [req.user.id]
    );

    const [addresses] = await connection.query(
      `SELECT id
       FROM user_addresses
       WHERE id = ? AND user_id = ?`,
      [req.params.id, req.user.id]
    );

    if (addresses.length === 0) {
      await connection.rollback();

      return res.status(404).json({
        success: false,
        message: "Alamat tidak ditemukan."
      });
    }

    await connection.query(
      `UPDATE user_addresses
       SET is_primary = 0
       WHERE user_id = ?`,
      [req.user.id]
    );

    await connection.query(
      `UPDATE user_addresses
       SET is_primary = 1
       WHERE id = ? AND user_id = ?`,
      [req.params.id, req.user.id]
    );

    await connection.commit();

    return res.json({
      success: true,
      message: "Alamat utama berhasil diubah."
    });

  } catch (error) {
    if (connection) {
      await connection.rollback();
    }

    console.error("Set primary error:", error);

    return res.status(500).json({
      success: false,
      message: "Gagal mengubah alamat utama."
    });

  } finally {
    if (connection) {
      connection.release();
    }
  }
}

// ==========================================
// HAPUS ALAMAT
// ==========================================

async function deleteAddress(req, res) {
  let connection;

  try {
    connection = await db.getConnection();

    await connection.beginTransaction();

    await connection.query(
      "SELECT id FROM users WHERE id = ? FOR UPDATE",
      [req.user.id]
    );

    const [addresses] = await connection.query(
      `SELECT id, is_primary
       FROM user_addresses
       WHERE id = ? AND user_id = ?`,
      [req.params.id, req.user.id]
    );

    if (addresses.length === 0) {
      await connection.rollback();

      return res.status(404).json({
        success: false,
        message: "Alamat tidak ditemukan."
      });
    }

    await connection.query(
      `DELETE FROM user_addresses
       WHERE id = ? AND user_id = ?`,
      [req.params.id, req.user.id]
    );

    // Jika alamat utama dihapus,
    // alamat terbaru otomatis menjadi alamat utama.
    if (Number(addresses[0].is_primary) === 1) {
      const [remaining] = await connection.query(
        `SELECT id
         FROM user_addresses
         WHERE user_id = ?
         ORDER BY created_at DESC
         LIMIT 1`,
        [req.user.id]
      );

      if (remaining.length > 0) {
        await connection.query(
          `UPDATE user_addresses
           SET is_primary = 1
           WHERE id = ?`,
          [remaining[0].id]
        );
      }
    }

    await connection.commit();

    return res.json({
      success: true,
      message: "Alamat berhasil dihapus."
    });

  } catch (error) {
    if (connection) {
      await connection.rollback();
    }

    console.error("Delete address error:", error);

    return res.status(500).json({
      success: false,
      message: "Gagal menghapus alamat."
    });

  } finally {
    if (connection) {
      connection.release();
    }
  }
}

// ==========================================
// EXPORT CONTROLLER
// ==========================================

module.exports = {
  getAddresses,
  addAddress,
  updateAddress,
  setPrimaryAddress,
  deleteAddress
};

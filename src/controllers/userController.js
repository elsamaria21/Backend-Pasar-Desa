const { db } = require('../config/database');

async function getProfile(req, res) {
  try {
    const [users] = await db.query(
      `SELECT id, name, email, phone, role, created_at
       FROM users
       WHERE id = ?`,
      [req.user.id]
    );

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User tidak ditemukan'
      });
    }

    res.json({
      success: true,
      data: users[0]
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: 'Gagal mengambil profile'
    });
  }
}

async function updateProfile(req, res) {
  try {
    const {
      name,
      phone
    } = req.body;

    await db.query(
      `UPDATE users
       SET name = ?, phone = ?
       WHERE id = ?`,
      [
        name,
        phone || null,
        req.user.id
      ]
    );

    res.json({
      success: true,
      message: 'Profile berhasil diperbarui'
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: 'Gagal memperbarui profile'
    });
  }
}

module.exports = {
  getProfile,
  updateProfile
};
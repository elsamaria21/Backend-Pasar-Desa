const bcrypt =
  require("bcryptjs");

const jwt =
  require("jsonwebtoken");

const {
  pool,
} = require("../config/database");


// =====================================================
// REGISTER
// =====================================================

async function register(
  req,
  res
) {
  try {
    const {
      name,
      email,
      password,
    } = req.body;

    if (
      !name ||
      !email ||
      !password
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Nama, email, dan password wajib diisi.",
      });
    }

    const [
      existingUsers,
    ] = await pool.execute(
      `
      SELECT id
      FROM users
      WHERE email = ?
      `,
      [email]
    );

    if (
      existingUsers.length >
      0
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Email sudah terdaftar.",
      });
    }

    const hashedPassword =
      await bcrypt.hash(
        password,
        10
      );

    const [
      result,
    ] = await pool.execute(
      `
      INSERT INTO users
      (
        name,
        email,
        password
      )
      VALUES (?, ?, ?)
      `,
      [
        name,
        email,
        hashedPassword,
      ]
    );

    const token =
      jwt.sign(
        {
          id: result.insertId,
          email,
          role: "user",
        },
        process.env.JWT_SECRET,
        {
          expiresIn:
            "7d",
        }
      );

    return res.status(201).json({
      success: true,
      message:
        "Registrasi berhasil.",

      data: {
        id: result.insertId,
        name,
        email,
        role: "user",
        token,
      },
    });
  } catch (error) {
    console.error(
      "REGISTER ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Registrasi gagal.",
      error:
        error.message,
    });
  }
}


// =====================================================
// LOGIN
// =====================================================

async function login(
  req,
  res
) {
  try {
    const {
      email,
      password,
    } = req.body;

    if (
      !email ||
      !password
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Email dan password wajib diisi.",
      });
    }

    const [
      users,
    ] = await pool.execute(
      `
      SELECT *
      FROM users
      WHERE email = ?
      LIMIT 1
      `,
      [email]
    );

    if (
      users.length ===
      0
    ) {
      return res.status(401).json({
        success: false,
        message:
          "Email atau password salah.",
      });
    }

    const user =
      users[0];

    const passwordMatch =
      await bcrypt.compare(
        password,
        user.password
      );

    if (
      !passwordMatch
    ) {
      return res.status(401).json({
        success: false,
        message:
          "Email atau password salah.",
      });
    }

    const token =
      jwt.sign(
        {
          id: user.id,
          email: user.email,
          role: user.role,
        },
        process.env.JWT_SECRET,
        {
          expiresIn:
            "7d",
        }
      );

    return res.json({
      success: true,
      message:
        "Login berhasil.",

      data: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        token,
      },
    });
  } catch (error) {
    console.error(
      "LOGIN ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Login gagal.",
      error:
        error.message,
    });
  }
}

module.exports = {
  register,
  login,
};
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { pool } = require("../config/database");

function normalizePhone(value) {
  const digits = String(value || "").replace(/\D/g, "");

  if (!digits) return null;

  let normalized = digits;

  if (normalized.startsWith("0")) {
    normalized = `62${normalized.slice(1)}`;
  } else if (normalized.startsWith("8")) {
    normalized = `62${normalized}`;
  }

  if (!/^62\d{8,13}$/.test(normalized)) return null;

  return normalized;
}

function phoneLookupVariants(normalizedPhone) {
  const variants = [normalizedPhone];

  if (normalizedPhone.startsWith("62")) {
    variants.push(`0${normalizedPhone.slice(2)}`);
  }

  return [...new Set(variants)];
}

async function sendWhatsAppOtp(target, otp) {
  const token = String(process.env.FONNTE_TOKEN || "").trim();

  if (!token || token === "token_rahasia_kamu") {
    throw new Error("FONNTE_TOKEN belum diisi dengan token asli.");
  }

  const form = new FormData();
  form.append("target", target);
  form.append("countryCode", "0");
  form.append(
    "message",
    [
      `Kode OTP PasarDesa kamu: ${otp}`,
      "",
      "Kode berlaku selama 5 menit.",
      "Jangan berikan kode ini kepada siapa pun, termasuk pihak PasarDesa.",
      "Jika kamu tidak meminta perubahan kata sandi, abaikan pesan ini.",
    ].join("\n")
  );

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch("https://api.fonnte.com/send", {
      method: "POST",
      headers: {
        Authorization: token,
      },
      body: form,
      signal: controller.signal,
    });

    const result = await response.json().catch(() => ({}));
    const sent = result.status === true || result.Status === true;

    if (!response.ok || !sent) {
      console.error("FONNTE SEND ERROR:", {
        httpStatus: response.status,
        reason: result.reason || result.detail || "Unknown Fonnte error",
      });
      throw new Error("Pengiriman WhatsApp gagal.");
    }

    return result;
  } finally {
    clearTimeout(timeout);
  }
}

async function register(req, res) {
  try {
    const { email, password } = req.body;
    const name = req.body.name || req.body.nama;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Nama, email, dan password wajib diisi.",
      });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email))) {
      return res.status(400).json({
        success: false,
        message: "Format email tidak valid.",
      });
    }

    if (String(password).length < 8) {
      return res.status(400).json({
        success: false,
        message: "Password minimal 8 karakter.",
      });
    }

    const [existingUsers] = await pool.execute(
      `SELECT id FROM users WHERE email = ?`,
      [email]
    );

    if (existingUsers.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Email sudah terdaftar.",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const phone = req.body.phone || req.body.telepon || null;

    const [result] = await pool.execute(
      `
      INSERT INTO users (name, email, password, phone)
      VALUES (?, ?, ?, ?)
      `,
      [name, email, hashedPassword, phone]
    );

    const token = jwt.sign(
      {
        id: result.insertId,
        email,
        role: "user",
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    return res.status(201).json({
      success: true,
      message: "Registrasi berhasil.",
      data: {
        id: result.insertId,
        name,
        email,
        phone,
        role: "user",
        token,
      },
    });
  } catch (error) {
    console.error("REGISTER ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Registrasi gagal.",
    });
  }
}

async function login(req, res) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email dan password wajib diisi.",
      });
    }

    const [users] = await pool.execute(
      `SELECT * FROM users WHERE email = ? LIMIT 1`,
      [email]
    );

    if (users.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Email atau password salah.",
      });
    }

    const user = users[0];
    const passwordMatch = await bcrypt.compare(password, user.password);

    if (!passwordMatch) {
      return res.status(401).json({
        success: false,
        message: "Email atau password salah.",
      });
    }

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    return res.json({
      success: true,
      message: "Login berhasil.",
      data: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone || null,
        role: user.role,
        token,
      },
    });
  } catch (error) {
    console.error("LOGIN ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Login gagal.",
    });
  }
}

async function forgotPassword(req, res) {
  try {
    const normalizedPhone = normalizePhone(req.body.phone);

    if (!normalizedPhone) {
      return res.status(400).json({
        success: false,
        message: "Masukkan nomor WhatsApp Indonesia yang valid.",
      });
    }

    if (!process.env.FONNTE_TOKEN) {
      console.error("FONNTE_TOKEN belum dikonfigurasi di backend.");
      return res.status(503).json({
        success: false,
        message: "Layanan OTP sedang belum tersedia. Coba lagi nanti.",
      });
    }

    const variants = phoneLookupVariants(normalizedPhone);
    const placeholders = variants.map(() => "?").join(", ");

    const normalizedDbPhone = `
      REPLACE(
        REPLACE(
          REPLACE(
            REPLACE(
              REPLACE(phone, '+', ''),
            ' ', ''),
          '-', ''),
        '(', ''),
      ')', '')
    `;

    const [users] = await pool.execute(
      `
      SELECT id, name, phone
      FROM users
      WHERE ${normalizedDbPhone} IN (${placeholders})
      LIMIT 1
      `,
      variants
    );

    if (users.length === 0) {
      return res.json({
        success: true,
        message:
          "Jika nomor terdaftar, kode OTP akan dikirim melalui WhatsApp.",
      });
    }

    const user = users[0];

    const [recentRows] = await pool.execute(
      `
      SELECT created_at
      FROM password_reset_otps
      WHERE user_id = ?
      ORDER BY id DESC
      LIMIT 1
      `,
      [user.id]
    );

    if (recentRows.length > 0) {
      const lastRequestAt = new Date(recentRows[0].created_at).getTime();
      const elapsed = Date.now() - lastRequestAt;

      if (Number.isFinite(lastRequestAt) && elapsed < 60 * 1000) {
        return res.status(429).json({
          success: false,
          message: "Tunggu 60 detik sebelum meminta OTP lagi.",
        });
      }
    }

    const [hourlyRows] = await pool.execute(
      `
      SELECT COUNT(*) AS total
      FROM password_reset_otps
      WHERE user_id = ?
        AND created_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR)
      `,
      [user.id]
    );

    if (Number(hourlyRows[0].total) >= 5) {
      return res.status(429).json({
        success: false,
        message:
          "Batas permintaan OTP tercapai. Coba kembali satu jam lagi.",
      });
    }

    const otp = String(crypto.randomInt(100000, 1000000));
    const otpHash = await bcrypt.hash(otp, 10);

    await pool.execute(
      `
      UPDATE password_reset_otps
      SET used_at = NOW()
      WHERE user_id = ?
        AND used_at IS NULL
      `,
      [user.id]
    );

    await pool.execute(
      `
      INSERT INTO password_reset_otps
        (user_id, phone, otp_hash, attempts, expires_at, created_at)
      VALUES
        (?, ?, ?, 0, DATE_ADD(NOW(), INTERVAL 5 MINUTE), NOW())
      `,
      [user.id, normalizedPhone, otpHash]
    );

    try {
      await sendWhatsAppOtp(normalizedPhone, otp);
    } catch (sendError) {
      await pool.execute(
        `
        UPDATE password_reset_otps
        SET used_at = NOW()
        WHERE user_id = ?
          AND used_at IS NULL
        `,
        [user.id]
      );

      console.error("FORGOT PASSWORD WHATSAPP ERROR:", sendError.message);

      return res.status(503).json({
        success: false,
        message:
          "WhatsApp OTP gagal dikirim. Periksa koneksi perangkat WhatsApp dan coba lagi.",
      });
    }

    return res.json({
      success: true,
      message:
        "Jika nomor terdaftar, kode OTP telah dikirim melalui WhatsApp.",
    });
  } catch (error) {
    console.error("FORGOT PASSWORD ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Gagal memproses permintaan OTP.",
    });
  }
}

async function verifyOtp(req, res) {
  try {
    const normalizedPhone = normalizePhone(req.body.phone);
    const otp = String(req.body.otp || "").trim();

    if (!normalizedPhone || !/^\d{6}$/.test(otp)) {
      return res.status(400).json({
        success: false,
        message: "Nomor WhatsApp atau kode OTP tidak valid.",
      });
    }

    const variants = phoneLookupVariants(normalizedPhone);
    const placeholders = variants.map(() => "?").join(", ");

    const normalizedDbPhone = `
      REPLACE(
        REPLACE(
          REPLACE(
            REPLACE(
              REPLACE(phone, '+', ''),
            ' ', ''),
          '-', ''),
        '(', ''),
      ')', '')
    `;

    const [users] = await pool.execute(
      `
      SELECT id
      FROM users
      WHERE ${normalizedDbPhone} IN (${placeholders})
      LIMIT 1
      `,
      variants
    );

    if (users.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Kode OTP tidak valid atau sudah kedaluwarsa.",
      });
    }

    const [otpRows] = await pool.execute(
      `
      SELECT *
      FROM password_reset_otps
      WHERE user_id = ?
        AND used_at IS NULL
        AND verified_at IS NULL
        AND expires_at > NOW()
      ORDER BY id DESC
      LIMIT 1
      `,
      [users[0].id]
    );

    if (otpRows.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Kode OTP tidak valid atau sudah kedaluwarsa.",
      });
    }

    const otpRecord = otpRows[0];

    if (Number(otpRecord.attempts) >= 5) {
      await pool.execute(
        `UPDATE password_reset_otps SET used_at = NOW() WHERE id = ?`,
        [otpRecord.id]
      );

      return res.status(429).json({
        success: false,
        message:
          "Batas percobaan OTP tercapai. Minta kode OTP baru.",
      });
    }

    await pool.execute(
      `
      UPDATE password_reset_otps
      SET attempts = attempts + 1
      WHERE id = ?
      `,
      [otpRecord.id]
    );

    const otpMatches = await bcrypt.compare(otp, otpRecord.otp_hash);

    if (!otpMatches) {
      return res.status(400).json({
        success: false,
        message: "Kode OTP salah. Periksa kembali.",
      });
    }

    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetTokenHash = crypto
      .createHash("sha256")
      .update(resetToken)
      .digest("hex");

    await pool.execute(
      `
      UPDATE password_reset_otps
      SET
        verified_at = NOW(),
        reset_token_hash = ?,
        reset_token_expires_at = DATE_ADD(NOW(), INTERVAL 10 MINUTE)
      WHERE id = ?
      `,
      [resetTokenHash, otpRecord.id]
    );

    return res.json({
      success: true,
      message: "OTP berhasil diverifikasi.",
      data: {
        resetToken,
      },
    });
  } catch (error) {
    console.error("VERIFY OTP ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Gagal memverifikasi OTP.",
    });
  }
}

async function resetPassword(req, res) {
  const resetToken = String(req.body.resetToken || "").trim();
  const newPassword = String(req.body.newPassword || "");

  if (!resetToken || resetToken.length !== 64) {
    return res.status(400).json({
      success: false,
      message: "Sesi pemulihan tidak valid. Ulangi proses OTP.",
    });
  }

  if (newPassword.length < 8) {
    return res.status(400).json({
      success: false,
      message: "Password baru minimal 8 karakter.",
    });
  }

  const resetTokenHash = crypto
    .createHash("sha256")
    .update(resetToken)
    .digest("hex");

  let connection;

  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [otpRows] = await connection.execute(
      `
      SELECT id, user_id
      FROM password_reset_otps
      WHERE reset_token_hash = ?
        AND verified_at IS NOT NULL
        AND reset_token_expires_at > NOW()
        AND used_at IS NULL
      ORDER BY id DESC
      LIMIT 1
      FOR UPDATE
      `,
      [resetTokenHash]
    );

    if (otpRows.length === 0) {
      await connection.rollback();

      return res.status(400).json({
        success: false,
        message:
          "Sesi pemulihan tidak valid atau kedaluwarsa. Ulangi proses OTP.",
      });
    }

    const record = otpRows[0];
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await connection.execute(
      `UPDATE users SET password = ? WHERE id = ?`,
      [hashedPassword, record.user_id]
    );

    await connection.execute(
      `
      UPDATE password_reset_otps
      SET
        used_at = NOW(),
        reset_token_hash = NULL
      WHERE id = ?
      `,
      [record.id]
    );

    await connection.execute(
      `
      UPDATE password_reset_otps
      SET used_at = NOW(), reset_token_hash = NULL
      WHERE user_id = ?
        AND id <> ?
        AND used_at IS NULL
      `,
      [record.user_id, record.id]
    );

    await connection.commit();

    return res.json({
      success: true,
      message:
        "Password berhasil diperbarui. Silakan login dengan password baru.",
    });
  } catch (error) {
    if (connection) {
      try {
        await connection.rollback();
      } catch (_) {}
    }

    console.error("RESET PASSWORD ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Gagal memperbarui password.",
    });
  } finally {
    if (connection) connection.release();
  }
}

async function me(req, res) {
  try {
    const [users] = await pool.execute(
      `SELECT id, name, email, role FROM users WHERE id = ? LIMIT 1`,
      [req.user.id]
    );

    if (users.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Akun tidak ditemukan.",
      });
    }

    const user = users[0];

    return res.json({
      success: true,
      data: {
        id: String(user.id),
        nama: user.name,
        email: user.email,
        role: user.role,
        jabatan: user.role === "admin" ? "Administrator" : "Pengguna",
      },
    });
  } catch (error) {
    console.error("ME ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Gagal mengambil profil.",
    });
  }
}

module.exports = {
  register,
  login,
  me,
  forgotPassword,
  verifyOtp,
  resetPassword,
};

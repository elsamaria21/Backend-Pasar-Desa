const jwt = require("jsonwebtoken");

function authMiddleware(
  req,
  res,
  next
) {
  try {
    const authorization =
      req.headers.authorization;

    if (!authorization) {
      return res.status(401).json({
        success: false,
        message:
          "Token tidak ditemukan.",
      });
    }

    const token =
      authorization.startsWith(
        "Bearer "
      )
        ? authorization.substring(7)
        : authorization;

    const decoded =
      jwt.verify(
        token,
        process.env.JWT_SECRET
      );

    req.user = decoded;

    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message:
        "Token tidak valid atau sudah expired.",
    });
  }
}

module.exports =
  authMiddleware;
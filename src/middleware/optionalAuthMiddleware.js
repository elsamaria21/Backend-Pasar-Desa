const jwt = require("jsonwebtoken");

// Mengisi req.user bila ada token yang valid, tetapi TIDAK menolak permintaan tanpa token.
// Dipakai untuk rute publik yang isinya sedikit berbeda untuk admin (mis. produk tersembunyi).
function optionalAuthMiddleware(req, res, next) {
  const header = req.headers.authorization;

  if (header && header.startsWith("Bearer ")) {
    try {
      req.user = jwt.verify(header.slice(7), process.env.JWT_SECRET);
    } catch {
      // token rusak/kedaluwarsa dianggap pengunjung biasa
    }
  }

  next();
}

module.exports = optionalAuthMiddleware;

require("dotenv").config();

const app =
  require("./src/app");

const {
  testConnection,
} =
  require("./src/config/database");

// Tolak start bila JWT_SECRET kosong/pendek/masih placeholder dari .env.example:
// secret yang bisa ditebak membuat siapa pun mampu memalsukan token admin.
const PLACEHOLDER_SECRETS = ["ganti_dengan_secret_sendiri", "secret", "changeme"];
const jwtSecret = process.env.JWT_SECRET || "";
if (jwtSecret.length < 32 || PLACEHOLDER_SECRETS.includes(jwtSecret)) {
  console.error(
    "JWT_SECRET belum aman. Isi .env dengan string acak minimal 32 karakter, mis.:\n" +
      '  node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"'
  );
  process.exit(1);
}


const PORT =
  process.env.PORT ||
  3000;


async function startServer() {
  await testConnection();

  app.listen(
    PORT,
    "0.0.0.0",
    () => {
      console.log(
        "================================="
      );

      console.log(
        "PASAR DESA BACKEND"
      );

      console.log(
        "================================="
      );

      console.log(
        `Server : http://localhost:${PORT}`
      );

      console.log(
        `Products : http://localhost:${PORT}/api/products`
      );

      console.log(
        `AI : http://localhost:${PORT}/api/ai`
      );

      console.log(
        `Search : http://localhost:${PORT}/api/search`
      );

      console.log(
        "================================="
      );
    }
  );
}


startServer();
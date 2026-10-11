require("dotenv").config();

const app =
  require("./src/app");

const {
  testConnection,
} =
  require("./src/config/database");


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
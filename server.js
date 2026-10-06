require('dotenv').config();
const app = require('./src/app');
const { testConnection } = require('./src/config/database');

const PORT = Number(process.env.PORT || 3000);

(async () => {
  await testConnection();
  app.listen(PORT, '0.0.0.0', () => {
    console.log('=========================================');
    console.log('       PASAR DESA BACKEND API');
    console.log('=========================================');
    console.log(`Server : http://localhost:${PORT}`);
    console.log(`Health : http://localhost:${PORT}/api/health`);
    console.log('=========================================');
  });
})();

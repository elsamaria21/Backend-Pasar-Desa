// Menjadikan sebuah akun (yang sudah mendaftar) sebagai admin dashboard.
// Pemakaian: npm run make-admin -- email@desa.id
require("dotenv").config();
const { pool } = require("../src/config/database");

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error("Pemakaian: npm run make-admin -- email@desa.id");
    process.exit(1);
  }

  const [result] = await pool.execute("UPDATE users SET role = 'admin' WHERE email = ?", [email]);

  if (!result.affectedRows) {
    console.error(`Akun dengan email ${email} tidak ditemukan. Daftar dulu lewat /api/auth/register.`);
    process.exitCode = 1;
  } else {
    console.log(`${email} sekarang admin. Login ulang agar token baru memuat role admin.`);
  }
  await pool.end();
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});

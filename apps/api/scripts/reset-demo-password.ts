import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { envSchema } from "../src/config/env.schema.js";
import * as schema from "../src/db/schema.js";
import { resetPasswords } from "../src/db/reset-passwords.js";
import { resolveSeedPassword } from "../src/db/seed-password.js";
import { seedUsers } from "./seed-data.js";

// Đặt lại mật khẩu cho 6 tài khoản demo do seed tạo (plan 34). Mật khẩu lấy từ SEED_PASSWORD
// theo cùng luật với seed (plan 33): database không ở máy local thì bắt buộc mật khẩu riêng.
// Dùng: SEED_PASSWORD=... pnpm --filter @credflow/api db:reset-demo-password
// (trên Railway: `railway ssh --service api`, nhập mật khẩu bằng `read -s`).
const envFile = resolve(import.meta.dirname, "../../../.env");
if (existsSync(envFile)) process.loadEnvFile(envFile);

const { DATABASE_URL } = envSchema
  .pick({ DATABASE_URL: true })
  .parse(process.env);
// Kiểm mật khẩu trước khi mở kết nối: sai thì dừng, không đổi gì.
const password = resolveSeedPassword({
  DATABASE_URL,
  SEED_PASSWORD: process.env.SEED_PASSWORD,
});

const pool = new Pool({ connectionString: DATABASE_URL });
const db = drizzle({ client: pool, schema });

try {
  const n = await resetPasswords(
    db,
    seedUsers.map((u) => u.email),
    password,
  );
  console.log(
    `reset demo password: ${String(n)}/${String(seedUsers.length)} user, session cũ đã xoá`,
  );
} catch (err) {
  console.error("reset demo password failed:", err);
  // Không process.exit(1): để pool.end() trong finally chạy xong.
  process.exitCode = 1;
} finally {
  await pool.end();
}

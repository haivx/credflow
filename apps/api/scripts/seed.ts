import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { envSchema } from "../src/config/env.schema.js";
import * as schema from "../src/db/schema.js";
import { seedStaff } from "./seed-data.js";

// Script chạy một lần rồi thoát: không cần Nest, tự nạp .env ở gốc repo (scripts/ → apps/api → apps → gốc).
// Biến môi trường thật vẫn thắng .env.
const envFile = resolve(import.meta.dirname, "../../../.env");
if (existsSync(envFile)) process.loadEnvFile(envFile);

const { DATABASE_URL } = envSchema
  .pick({ DATABASE_URL: true })
  .parse(process.env);

const pool = new Pool({ connectionString: DATABASE_URL });
const db = drizzle({ client: pool, schema });

try {
  // ON CONFLICT DO NOTHING: id đã có thì bỏ qua → chạy lại không sinh dòng trùng.
  const inserted = await db
    .insert(schema.staff)
    .values(seedStaff)
    .onConflictDoNothing()
    .returning({ id: schema.staff.id });
  console.log(
    `seed staff: inserted ${inserted.length}, skipped ${seedStaff.length - inserted.length}`,
  );
} catch (err) {
  console.error("seed staff failed:", err);
  // Không dùng process.exit(1): thoát ngay sẽ cắt ngang pool.end() trong finally.
  process.exitCode = 1;
} finally {
  await pool.end();
}

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "drizzle-kit";
import { envSchema } from "./src/config/env.schema.js";

// drizzle-kit không đi qua ConfigModule: tự nạp .env ở gốc repo (giống config.options.ts),
// biến môi trường thật vẫn thắng .env. Chỉ cần DATABASE_URL.
// drizzle-kit nạp file này dạng CommonJS nên `import.meta.dirname` là undefined: tính theo cwd,
// lệnh luôn chạy qua `pnpm --filter @credflow/api` (cwd = apps/api).
const envFile = resolve(process.cwd(), "../../.env");
if (existsSync(envFile)) process.loadEnvFile(envFile);

const { DATABASE_URL } = envSchema
  .pick({ DATABASE_URL: true })
  .parse(process.env);

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: DATABASE_URL },
});

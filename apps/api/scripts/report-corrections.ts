import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { envSchema } from "../src/config/env.schema.js";
import * as schema from "../src/db/schema.js";
import {
  formatCorrectionsReport,
  loadCorrectionsReport,
} from "../src/review/corrections-report.js";

// Báo cáo trường hay bị sửa nhất (plan 29): đọc review_actions của DATABASE_URL, in Markdown.
// Dùng: make report-corrections [ARGS="--out <file.md>"]. Chỉ đọc, không ghi DB.
const envFile = resolve(import.meta.dirname, "../../../.env");
if (existsSync(envFile)) process.loadEnvFile(envFile);

const { values: args } = parseArgs({
  options: { out: { type: "string" } },
});
const { DATABASE_URL } = envSchema
  .pick({ DATABASE_URL: true })
  .parse(process.env);

const pool = new Pool({ connectionString: DATABASE_URL });
const db = drizzle({ client: pool, schema });

try {
  const report = await loadCorrectionsReport(db);
  const text = formatCorrectionsReport(report, new Date().toISOString());
  process.stdout.write(text);
  if (args.out !== undefined) {
    // pnpm --filter chạy trong apps/api: đường dẫn tương đối tính từ thư mục gọi make (INIT_CWD).
    const out = resolve(process.env.INIT_CWD ?? process.cwd(), args.out);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, text);
    console.error(`đã ghi ${out}`);
  }
} catch (err) {
  console.error("report-corrections failed:", err);
  // Không process.exit(1): để pool.end() trong finally chạy xong.
  process.exitCode = 1;
} finally {
  await pool.end();
}

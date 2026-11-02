import { resolve } from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { assertTestDatabase, testEnv } from "./test-env.js";

// Chạy một lần trước mọi file integration test: áp migration lên DB test (tmpfs nên lần đầu luôn trống).
export default async function setup() {
  assertTestDatabase(testEnv.DATABASE_URL);
  const pool = new Pool({ connectionString: testEnv.DATABASE_URL });
  try {
    await migrate(drizzle({ client: pool }), {
      migrationsFolder: resolve(import.meta.dirname, "../drizzle"),
    });
  } finally {
    await pool.end();
  }
}

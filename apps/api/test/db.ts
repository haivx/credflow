import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../src/db/schema.js";
import type { Db } from "../src/db/db.provider.js";
import { assertTestDatabase, testEnv } from "./test-env.js";

// Helper cho integration test chạm thẳng DB (không cần dựng app Nest).

/** Kết nối riêng tới DB test. Nhớ gọi close() trong afterAll, không thì vitest treo. */
export function createTestDb(): { db: Db; close: () => Promise<void> } {
  assertTestDatabase(testEnv.DATABASE_URL);
  const pool = new Pool({ connectionString: testEnv.DATABASE_URL });
  const db = drizzle({ client: pool, schema });
  return { db, close: () => pool.end() };
}

/**
 * Xoá sạch mọi bảng giữa các test. Phải TRUNCATE cùng lúc mọi bảng có FK trỏ vào nhau:
 * TRUNCATE riêng `staff` bị Postgres từ chối vì `documents` đang tham chiếu nó.
 */
export async function truncateAll(db: Db) {
  await db.execute(sql`TRUNCATE review_actions, documents, staff`);
}

type NewStaff = typeof schema.staff.$inferInsert;
type NewDocument = typeof schema.documents.$inferInsert;

let seq = 0;
/** Số tăng dần để mỗi lần gọi make* ra id/checksum khác nhau. */
function next() {
  seq += 1;
  return seq.toString().padStart(4, "0");
}

export function makeStaff(overrides: Partial<NewStaff> = {}): NewStaff {
  const n = next();
  return {
    id: `01TESTSTAFF${n}`,
    legalName: `Test Staff ${n}`,
    role: "nurse",
    region: "north",
    ...overrides,
  };
}

/** Document hợp lệ, checksum là sha256 hex thật và không trùng giữa các lần gọi. */
export function makeDocument(
  staffId: string,
  overrides: Partial<NewDocument> = {},
): NewDocument {
  const n = next();
  return {
    id: `01TESTDOC${n}`,
    staffId,
    fileName: `cpr-sample-${n}.png`,
    mimeType: "image/png",
    storageKey: `documents/01TESTDOC${n}`,
    checksum: createHash("sha256").update(`doc-${n}`).digest("hex"),
    sizeBytes: 1024,
    ...overrides,
  };
}

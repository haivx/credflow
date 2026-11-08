import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../src/db/schema.js";
import type { Db } from "../src/db/db.provider.js";
import type { DocumentStatus } from "@credflow/contracts";
import { contractFixture } from "./contract-fixtures.js";
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
  await db.execute(
    sql`TRUNCATE app_settings, sessions, review_actions, documents, users, staff`,
  );
}

type NewStaff = typeof schema.staff.$inferInsert;
type NewDocument = typeof schema.documents.$inferInsert;
type NewUser = typeof schema.users.$inferInsert;

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

/**
 * User hợp lệ cho test ràng buộc DB. Mặc định là reviewer (không cần staffId).
 * passwordHash là chuỗi giả: test đăng nhập dùng `createUser` trong test/auth.ts (hash thật).
 */
export function makeUser(overrides: Partial<NewUser> = {}): NewUser {
  const n = next();
  return {
    id: `01TESTUSER${n}`,
    email: `user-${n}@example.test`,
    passwordHash: "scrypt$16384$8$1$00$00",
    role: "reviewer",
    staffId: null,
    ...overrides,
  };
}

/**
 * Document hợp lệ đầy đủ cho một status (theo CHECK A6, A7, C1, C2, C4, C5).
 * Kết quả pipeline lấy từ fixture của packages/contracts, không viết tay.
 */
export function makeProcessedDocument(
  staffId: string,
  status: DocumentStatus,
  overrides: Partial<NewDocument> = {},
): NewDocument {
  const sample = contractFixture(
    "DocumentRecord",
    "CPR chuyển người duyệt vì tổ chức cấp",
  );
  const blockPassed = contractFixture("RuleResult", "rule block qua");
  const blockFailed = contractFixture("RuleResult", "rule block không qua");
  const infoFailed = contractFixture("RuleResult", "rule info không qua");
  const autoApprove = contractFixture("RoutingDecision", "tự duyệt");
  const needsReview = contractFixture("RoutingDecision", "chuyển người duyệt");

  const processed = { versions: sample.versions };
  const extracted = {
    ...processed,
    classification: sample.classification,
    extraction: sample.extraction,
  };
  const reviewed = {
    ...extracted,
    ruleResults: [blockFailed, blockPassed],
    routing: needsReview,
  };
  const byStatus: Record<DocumentStatus, Partial<NewDocument>> = {
    uploaded: {},
    processing: processed,
    extracted,
    auto_approved: {
      ...extracted,
      ruleResults: [blockPassed, infoFailed],
      routing: autoApprove,
      asOf: "2026-11-06",
    },
    needs_review: reviewed,
    approved: reviewed,
    rejected: reviewed,
    reupload_requested: reviewed,
    failed: {
      ...processed,
      error: { step: "extract", message: "LLM timeout (SAMPLE)" },
    },
  };
  return makeDocument(staffId, { status, ...byStatus[status], ...overrides });
}

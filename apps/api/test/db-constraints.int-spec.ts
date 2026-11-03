import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { documents, reviewActions, staff, users } from "../src/db/schema.js";
import {
  createTestDb,
  makeDocument,
  makeStaff,
  makeUser,
  truncateAll,
} from "./db.js";

// Chứng minh Postgres tự từ chối dữ liệu sai, kể cả khi code bỏ sót.
// Insert thẳng qua Drizzle, không qua API: đang test DB, không test service.

describe("ràng buộc DB (integration)", () => {
  const { db, close } = createTestDb();
  const owner = makeStaff();
  const reviewer = makeUser();

  beforeEach(async () => {
    await truncateAll(db);
    await db.insert(staff).values(owner);
    await db.insert(users).values(reviewer);
  });

  afterAll(async () => {
    await close();
  });

  // Ca đối chứng: dữ liệu hợp lệ thì insert được. Không có ca này thì các test lỗi
  // bên dưới có thể "pass" chỉ vì helper sinh dữ liệu sai từ đầu.
  it("insert document hợp lệ thành công", async () => {
    await db.insert(documents).values(makeDocument(owner.id));
    const rows = await db.select().from(documents);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe("uploaded");
    expect(rows[0]?.ruleResults).toEqual([]);
  });

  it("insert document lỗi với staff ID không tồn tại", async () => {
    const insert = db.insert(documents).values(makeDocument("non-existent-id"));

    await expect(insert).rejects.toMatchObject({
      cause: { code: "23503", constraint: "documents_staff_id_staff_id_fk" },
    });
  });

  it("trùng checksum → 23505", async () => {
    const first = makeDocument(owner.id);
    await db.insert(documents).values(first);

    const insert = db
      .insert(documents)
      .values(makeDocument(owner.id, { checksum: first.checksum }));

    await expect(insert).rejects.toMatchObject({
      cause: { code: "23505", constraint: "documents_checksum_unique" },
    });
  });

  it("status ngoài danh sách → 23514", async () => {
    const insert = db.insert(documents).values(
      // @ts-expect-error $type<DocumentStatus> chặn ở TS; test này giả lập code bỏ qua TS (ép kiểu, SQL thô).
      makeDocument(owner.id, { status: "done" }),
    );

    await expect(insert).rejects.toMatchObject({
      cause: { code: "23514", constraint: "documents_status_check" },
    });
  });

  it("checksum không phải sha256 hex → 23514", async () => {
    const insert = db
      .insert(documents)
      .values(makeDocument(owner.id, { checksum: "abc" }));

    await expect(insert).rejects.toMatchObject({
      cause: { code: "23514", constraint: "documents_checksum_check" },
    });
  });

  it("thiếu cột NOT NULL (staff_id) → 23502", async () => {
    // TS không cho thiếu staffId, nên viết SQL thô để giả lập một đường ghi khác (script, psql).
    const doc = makeDocument(owner.id);
    const insert = db.execute(sql`
      INSERT INTO documents (id, file_name, mime_type, storage_key, checksum, size_bytes)
      VALUES (${doc.id}, ${doc.fileName}, ${doc.mimeType}, ${doc.storageKey}, ${doc.checksum}, ${doc.sizeBytes})
    `);

    await expect(insert).rejects.toMatchObject({
      cause: { code: "23502", column: "staff_id" },
    });
  });

  it("xoá staff còn document → 23503 (RESTRICT)", async () => {
    await db.insert(documents).values(makeDocument(owner.id));

    const remove = db.delete(staff).where(eq(staff.id, owner.id));

    await expect(remove).rejects.toMatchObject({
      cause: { code: "23503", constraint: "documents_staff_id_staff_id_fk" },
    });
    // Không xoá được gì: document vẫn còn.
    expect(await db.select().from(documents)).toHaveLength(1);
  });

  it("review action ngoài danh sách → 23514", async () => {
    const doc = makeDocument(owner.id);
    await db.insert(documents).values(doc);

    const row: typeof reviewActions.$inferInsert = {
      id: "01TESTREVACT0001",
      documentId: doc.id,
      reviewerId: reviewer.id,
      // @ts-expect-error $type chặn ở TS; DB vẫn phải tự chặn.
      action: "auto_reject",
    };
    const insert = db.insert(reviewActions).values(row);

    await expect(insert).rejects.toMatchObject({
      cause: { code: "23514", constraint: "review_actions_action_check" },
    });
  });

  it("review action với reviewer không tồn tại → 23503", async () => {
    const doc = makeDocument(owner.id);
    await db.insert(documents).values(doc);

    const insert = db.insert(reviewActions).values({
      id: "01TESTREVACT0002",
      documentId: doc.id,
      reviewerId: "khong-co-user",
      action: "approve",
    });

    await expect(insert).rejects.toMatchObject({
      cause: {
        code: "23503",
        constraint: "review_actions_reviewer_id_users_id_fk",
      },
    });
  });

  describe("users", () => {
    it("user staff gắn hồ sơ staff thì insert được (đối chứng)", async () => {
      await db
        .insert(users)
        .values(makeUser({ role: "staff", staffId: owner.id }));
      expect(await db.select().from(users)).toHaveLength(2);
    });

    it.each([
      ["staff không có staffId", { role: "staff" as const, staffId: null }],
      ["reviewer có staffId", { role: "reviewer" as const, staffId: "x" }],
    ])("%s → 23514", async (_name, overrides) => {
      // staffId "x" không tồn tại nhưng CHECK chạy trước FK, nên lỗi là 23514.
      const insert = db.insert(users).values(makeUser(overrides));

      await expect(insert).rejects.toMatchObject({
        cause: { code: "23514", constraint: "users_staff_id_check" },
      });
    });

    it("vai trò ngoài danh sách → 23514", async () => {
      // @ts-expect-error $type chặn ở TS; DB vẫn phải tự chặn.
      const insert = db.insert(users).values(makeUser({ role: "root" }));

      await expect(insert).rejects.toMatchObject({
        cause: { code: "23514", constraint: "users_role_check" },
      });
    });

    it("email chữ hoa → 23514 (không lách được unique index)", async () => {
      const insert = db
        .insert(users)
        .values(makeUser({ email: reviewer.email.toUpperCase() }));

      await expect(insert).rejects.toMatchObject({
        cause: { code: "23514", constraint: "users_email_lower_check" },
      });
    });

    it("trùng email → 23505", async () => {
      const insert = db
        .insert(users)
        .values(makeUser({ email: reviewer.email }));

      await expect(insert).rejects.toMatchObject({
        cause: { code: "23505", constraint: "users_email_unique" },
      });
    });
  });
});

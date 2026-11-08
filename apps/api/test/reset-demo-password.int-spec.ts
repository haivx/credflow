import { createHash } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifyPassword } from "../src/auth/password.js";
import type { Db } from "../src/db/db.provider.js";
import { resetPasswords } from "../src/db/reset-passwords.js";
import { sessions, users } from "../src/db/schema.js";
import { createTestDb, makeUser, truncateAll } from "./db.js";

// Plan 34: đặt lại mật khẩu demo mà không xoá user (user có review_actions thì không xoá được).
describe("resetPasswords (plan 34)", () => {
  let db: Db;
  let close: () => Promise<void>;

  beforeAll(() => {
    ({ db, close } = createTestDb());
  });
  afterAll(async () => {
    await close();
  });
  beforeEach(async () => {
    await truncateAll(db);
  });

  async function userWithSession(email: string) {
    const u = makeUser({ email });
    await db.insert(users).values(u);
    await db.insert(sessions).values({
      id: `s-${u.id}`,
      userId: u.id,
      tokenHash: createHash("sha256").update(`token-${u.id}`).digest("hex"),
      expiresAt: new Date(Date.now() + 60_000),
    });
    return u;
  }

  it("đổi hash cho đúng các email được chọn, xoá session của họ, không đụng user khác", async () => {
    const demo = await userWithSession("reviewer@example.test");
    const other = await userWithSession("nguoi-khac@example.test");

    const n = await resetPasswords(
      db,
      ["reviewer@example.test", "khong-ton-tai@example.test"],
      "mat-khau-moi-123456",
    );
    expect(n).toBe(1);

    const [after] = await db
      .select()
      .from(users)
      .where(eq(users.id, demo.id ?? ""));
    expect(
      await verifyPassword("mat-khau-moi-123456", after?.passwordHash ?? ""),
    ).toBe(true);

    const left = await db
      .select({ userId: sessions.userId })
      .from(sessions)
      .where(inArray(sessions.userId, [demo.id ?? "", other.id ?? ""]));
    expect(left.map((s) => s.userId)).toEqual([other.id]);

    const [untouched] = await db
      .select()
      .from(users)
      .where(eq(users.id, other.id ?? ""));
    expect(untouched?.passwordHash).toBe(other.passwordHash);
  });
});

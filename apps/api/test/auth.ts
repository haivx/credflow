import type { INestApplication } from "@nestjs/common";
import type { AuthUser, UserRole } from "@credflow/contracts";
import request from "supertest";
import { hashPassword } from "../src/auth/password.js";
import type { Db } from "../src/db/db.provider.js";
import { staff, users } from "../src/db/schema.js";
import { makeStaff, makeUser } from "./db.js";

// Helper đăng nhập cho integration test: tạo user có hash thật rồi gọi POST /auth/login.

export const TEST_PASSWORD = "test-password";

// scrypt tốn vài chục ms: hash một lần, dùng lại cho mọi user test.
let testPasswordHash: Promise<string> | undefined;

/** Tạo user có mật khẩu TEST_PASSWORD. Vai trò staff thì tạo kèm hồ sơ staff. */
export async function createUser(db: Db, role: UserRole): Promise<AuthUser> {
  testPasswordHash ??= hashPassword(TEST_PASSWORD);
  let staffId: string | null = null;
  if (role === "staff") {
    const profile = makeStaff();
    await db.insert(staff).values(profile);
    staffId = profile.id;
  }
  const user = makeUser({
    role,
    staffId,
    passwordHash: await testPasswordHash,
  });
  await db.insert(users).values(user);
  return { id: user.id, email: user.email, role, staffId };
}

/** Lấy cặp `name=value` của session cookie từ response login, để gửi lại bằng `.set("Cookie", ...)`. */
export function sessionCookie(res: request.Response): string {
  const header: unknown = res.headers["set-cookie"];
  const first = Array.isArray(header) ? header[0] : undefined;
  if (typeof first !== "string") {
    throw new Error(`Response không có Set-Cookie (status ${res.status})`);
  }
  return first.split(";")[0] ?? "";
}

/** Tạo user vai trò `role`, đăng nhập, trả cookie. */
export async function loginAs(
  app: INestApplication,
  db: Db,
  role: UserRole,
): Promise<string> {
  const user = await createUser(db, role);
  const res = await request(app.getHttpServer())
    .post("/auth/login")
    .send({ email: user.email, password: TEST_PASSWORD });
  return sessionCookie(res);
}

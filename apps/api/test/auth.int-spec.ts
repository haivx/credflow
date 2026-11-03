import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ApiError, AuthUser } from "@credflow/contracts";
import { eq, sql } from "drizzle-orm";
import { AppModule } from "../src/app.module.js";
import { hashSessionToken } from "../src/auth/session-token.js";
import { type Db, DB } from "../src/db/db.provider.js";
import { sessions } from "../src/db/schema.js";
import { createUser, sessionCookie, TEST_PASSWORD } from "./auth.js";
import { truncateAll } from "./db.js";

describe("đăng nhập (integration)", () => {
  let app: INestApplication;
  let db: Db;
  let reviewer: AuthUser;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    await app.init();
    db = app.get(DB);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await truncateAll(db);
    reviewer = await createUser(db, "reviewer");
  });

  function login(body: object) {
    return request(app.getHttpServer()).post("/auth/login").send(body);
  }

  describe("POST /auth/login", () => {
    it("đúng mật khẩu → 200, trả AuthUser, set cookie httpOnly + SameSite=Lax", async () => {
      const res = await login({
        email: reviewer.email,
        password: TEST_PASSWORD,
      });

      expect(res.status).toBe(200);
      expect(AuthUser.parse(res.body)).toEqual(reviewer);
      expect(JSON.stringify(res.body)).not.toContain("scrypt");

      const setCookie = (res.headers["set-cookie"] as unknown as string[])[0];
      expect(setCookie).toMatch(/^credflow_session=[A-Za-z0-9_-]{43};/);
      expect(setCookie).toContain("HttpOnly");
      expect(setCookie).toContain("SameSite=Lax");
      expect(setCookie).toContain("Path=/");
      // COOKIE_SECURE mặc định false khi test (http).
      expect(setCookie).not.toContain("Secure");
    });

    it("email chữ hoa vẫn đăng nhập được (API chuẩn hoá)", async () => {
      const res = await login({
        email: reviewer.email.toUpperCase(),
        password: TEST_PASSWORD,
      });

      expect(res.status).toBe(200);
    });

    it("DB chỉ lưu hash của token, không lưu token thô", async () => {
      const res = await login({
        email: reviewer.email,
        password: TEST_PASSWORD,
      });
      const token = sessionCookie(res).split("=")[1] ?? "";

      const rows = await db.select().from(sessions);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.tokenHash).toBe(hashSessionToken(token));
      expect(rows[0]?.tokenHash).not.toBe(token);
    });

    it("sai mật khẩu và email không tồn tại → cùng một 401, không set cookie", async () => {
      const wrongPassword = await login({
        email: reviewer.email,
        password: "sai-mat-khau",
      });
      const unknownEmail = await login({
        email: "khong-co@example.test",
        password: TEST_PASSWORD,
      });

      for (const res of [wrongPassword, unknownEmail]) {
        expect(res.status).toBe(401);
        expect(ApiError.parse(res.body).code).toBe("UNAUTHORIZED");
        expect(res.headers["set-cookie"]).toBeUndefined();
      }
      expect(wrongPassword.body).toEqual(unknownEmail.body);
    });

    it.each([
      ["thiếu password", { email: "a@example.test" }],
      ["email sai format", { email: "abc", password: "x" }],
      ["key lạ", { email: "a@example.test", password: "x", role: "admin" }],
    ])("%s → 400 VALIDATION_FAILED", async (_name, body) => {
      const res = await login(body);

      expect(res.status).toBe(400);
      expect(ApiError.parse(res.body).code).toBe("VALIDATION_FAILED");
    });
  });

  describe("GET /auth/me và POST /auth/logout", () => {
    async function loggedInCookie() {
      return sessionCookie(
        await login({ email: reviewer.email, password: TEST_PASSWORD }),
      );
    }

    it("không có cookie → 401", async () => {
      const res = await request(app.getHttpServer()).get("/auth/me");

      expect(res.status).toBe(401);
      expect(ApiError.parse(res.body).code).toBe("UNAUTHORIZED");
    });

    it("cookie bịa → 401", async () => {
      const res = await request(app.getHttpServer())
        .get("/auth/me")
        .set("Cookie", "credflow_session=bia-ra");

      expect(res.status).toBe(401);
    });

    it("có cookie → 200, trả đúng user", async () => {
      // Lấy cookie trước rồi mới tạo request: supertest gọi listen() ngay khi tạo request,
      // await một request khác ở giữa chuỗi thì request kia đóng server trước.
      const cookie = await loggedInCookie();
      const res = await request(app.getHttpServer())
        .get("/auth/me")
        .set("Cookie", cookie);

      expect(res.status).toBe(200);
      expect(AuthUser.parse(res.body)).toEqual(reviewer);
    });

    it("logout → 204, xoá cookie, cookie cũ dùng lại bị 401", async () => {
      const cookie = await loggedInCookie();

      const out = await request(app.getHttpServer())
        .post("/auth/logout")
        .set("Cookie", cookie);
      expect(out.status).toBe(204);
      const cleared = (out.headers["set-cookie"] as unknown as string[])[0];
      expect(cleared).toMatch(/^credflow_session=;/);
      expect(await db.select().from(sessions)).toHaveLength(0);

      const again = await request(app.getHttpServer())
        .get("/auth/me")
        .set("Cookie", cookie);
      expect(again.status).toBe(401);
    });

    it("logout khi chưa đăng nhập → 401", async () => {
      const res = await request(app.getHttpServer()).post("/auth/logout");

      expect(res.status).toBe(401);
    });

    it("session hết hạn → 401", async () => {
      const cookie = await loggedInCookie();
      const token = cookie.split("=")[1] ?? "";
      await db
        .update(sessions)
        .set({ expiresAt: sql`now() - interval '1 second'` })
        .where(eq(sessions.tokenHash, hashSessionToken(token)));

      const res = await request(app.getHttpServer())
        .get("/auth/me")
        .set("Cookie", cookie);

      expect(res.status).toBe(401);
    });
  });

  it("/health và /ready không cần cookie", async () => {
    const health = await request(app.getHttpServer()).get("/health");
    const ready = await request(app.getHttpServer()).get("/ready");

    expect(health.status).toBe(200);
    expect(ready.status).toBe(200);
  });
});

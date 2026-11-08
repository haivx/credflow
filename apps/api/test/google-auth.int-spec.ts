import { createHash } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { AuthUser } from "@credflow/contracts";
import { count, eq } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type {
  GoogleIdentity,
  GoogleOAuth,
} from "../src/auth/google/google-oauth.client.js";
import type { Db } from "../src/db/db.provider.js";
import { staff, users } from "../src/db/schema.js";
import { createUser, TEST_PASSWORD } from "./auth.js";
import { makeUser, truncateAll } from "./db.js";

// Plan 36, ADR 0015: đăng ký / đăng nhập bằng Google. Google giả qua provider GOOGLE_OAUTH;
// mọi kiểm tra của app (state, PKCE, email_verified, trần, không tự liên kết) chạy thật.
// ConfigModule đọc env lúc nạp AppModule nên đặt env trước rồi mới import động.
const GOOGLE_ENV = {
  GOOGLE_CLIENT_ID: "test-client.apps.googleusercontent.com",
  GOOGLE_CLIENT_SECRET: "test-secret",
  GOOGLE_REDIRECT_URL: "http://localhost:3000/api/auth/google/callback",
  OAUTH_STATE_SECRET: "s".repeat(32),
  SIGNUP_DAILY_CAP: "3",
};

/** Google giả: `code` → danh tính; ghi lại verifier nhận được để kiểm PKCE. */
class FakeGoogle implements GoogleOAuth {
  identities = new Map<string, GoogleIdentity>();
  verifiers: string[] = [];
  failExchange = false;

  authUrl(state: string, codeChallenge: string): string {
    const url = new URL("https://accounts.google.test/o/oauth2/v2/auth");
    url.searchParams.set("state", state);
    url.searchParams.set("code_challenge", codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
    return url.toString();
  }

  exchange(code: string, codeVerifier: string): Promise<GoogleIdentity> {
    this.verifiers.push(codeVerifier);
    const identity = this.identities.get(code);
    if (this.failExchange || identity === undefined) {
      return Promise.reject(new Error("invalid_grant"));
    }
    return Promise.resolve(identity);
  }
}

describe("Đăng nhập bằng Google (plan 36)", () => {
  let app: INestApplication;
  let db: Db;
  const google = new FakeGoogle();
  const saved: Record<string, string | undefined> = {};

  beforeAll(async () => {
    for (const [k, v] of Object.entries(GOOGLE_ENV)) {
      saved[k] = process.env[k];
      process.env[k] = v;
    }
    const { Test } = await import("@nestjs/testing");
    const { AppModule } = await import("../src/app.module.js");
    const { DB } = await import("../src/db/db.provider.js");
    const { GOOGLE_OAUTH } =
      await import("../src/auth/google/google-oauth.client.js");
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(GOOGLE_OAUTH)
      .useValue(google)
      .compile();
    app = moduleFixture.createNestApplication();
    await app.init();
    db = app.get(DB);
  });

  afterAll(async () => {
    await app.close();
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) Reflect.deleteProperty(process.env, k);
      else process.env[k] = v;
    }
  });

  beforeEach(async () => {
    await truncateAll(db);
    google.identities.clear();
    google.verifiers = [];
    google.failExchange = false;
  });

  const http = () => request(app.getHttpServer());

  /** Bắt đầu đăng nhập: trả cookie state và các tham số đã gửi sang Google. */
  async function start() {
    const res = await http().get("/auth/google");
    expect(res.status).toBe(302);
    const location = new URL(res.headers.location ?? "");
    const setCookie = (res.headers["set-cookie"] as unknown as string[])[0];
    return {
      res,
      location,
      setCookie: setCookie ?? "",
      cookie: (setCookie ?? "").split(";")[0] ?? "",
      state: location.searchParams.get("state") ?? "",
      challenge: location.searchParams.get("code_challenge") ?? "",
    };
  }

  function callback(query: Record<string, string>, cookie?: string) {
    const req = http().get("/auth/google/callback").query(query);
    return cookie === undefined ? req : req.set("Cookie", cookie);
  }

  function identity(over: Partial<GoogleIdentity> = {}): GoogleIdentity {
    return {
      sub: "google-sub-001",
      email: "Ana.Thu@Gmail.com",
      emailVerified: true,
      name: "Ana Thu",
      ...over,
    };
  }

  /** Đăng nhập trọn vòng với danh tính `id`, trả response callback. */
  async function signIn(id: GoogleIdentity, code = `code-${id.sub}`) {
    google.identities.set(code, id);
    const { cookie, state } = await start();
    return callback({ code, state }, cookie);
  }

  const userCount = async () =>
    (await db.select({ n: count() }).from(users))[0]?.n ?? 0;

  it("GET /auth/providers → google: true", async () => {
    const res = await http().get("/auth/providers");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ google: true });
  });

  it("GET /auth/google → 302 sang Google kèm state + PKCE S256; cookie state httpOnly, Lax", async () => {
    const { location, setCookie, state, challenge } = await start();
    expect(location.host).toBe("accounts.google.test");
    expect(state.length).toBeGreaterThanOrEqual(16);
    expect(challenge.length).toBe(43);
    expect(setCookie).toMatch(/^credflow_oauth=/);
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Lax");
    // Cookie không chứa state dạng rõ cạnh chữ ký giả mạo được: phải có phần chữ ký.
    expect(setCookie.split(";")[0]).toContain(".");
  });

  it("Gmail mới → tạo staff + user (không mật khẩu), set session, về trang chủ", async () => {
    google.identities.set("c1", identity());
    const { cookie, state, challenge } = await start();
    const res = await callback({ code: "c1", state }, cookie);

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("/");
    // PKCE: verifier gửi lúc đổi code khớp challenge đã gửi lúc bắt đầu.
    const verifier = google.verifiers[0] ?? "";
    expect(createHash("sha256").update(verifier).digest("base64url")).toBe(
      challenge,
    );

    const cookies = res.headers["set-cookie"] as unknown as string[];
    const session = cookies.find((c) => c.startsWith("credflow_session="));
    expect(session).toContain("HttpOnly");
    // Cookie state bị xoá sau khi dùng.
    expect(cookies.some((c) => /^credflow_oauth=;/.test(c))).toBe(true);

    const me = await http()
      .get("/auth/me")
      .set("Cookie", (session ?? "").split(";")[0] ?? "");
    expect(me.status).toBe(200);
    const user = AuthUser.parse(me.body);
    expect(user.role).toBe("staff");
    expect(user.email).toBe("ana.thu@gmail.com");

    const [row] = await db.select().from(users).where(eq(users.id, user.id));
    expect(row?.googleSub).toBe("google-sub-001");
    expect(row?.passwordHash).toBeNull();
    const [profile] = await db
      .select()
      .from(staff)
      .where(eq(staff.id, user.staffId ?? ""));
    expect(profile).toMatchObject({
      legalName: "Ana Thu",
      role: "caregiver",
      clientIds: [],
      region: "CA",
    });
  });

  it("đăng nhập lại cùng Google → đúng tài khoản cũ, không tạo thêm", async () => {
    await signIn(identity());
    // Email trên Google đổi cũng vẫn nhận ra nhờ `sub`.
    const again = await signIn(identity({ email: "ana.moi@gmail.com" }), "c2");
    expect(again.headers.location).toBe("/");
    expect(await userCount()).toBe(1);
    expect((await db.select({ n: count() }).from(staff))[0]?.n).toBe(1);
  });

  it("state không khớp cookie → google_failed, không đổi code, không tạo user", async () => {
    google.identities.set("c1", identity());
    const { cookie } = await start();
    const res = await callback({ code: "c1", state: "state-gia" }, cookie);
    expect(res.headers.location).toBe("/?google_error=google_failed");
    expect(google.verifiers).toEqual([]);
    expect(await userCount()).toBe(0);
  });

  it("không có cookie state → google_failed", async () => {
    google.identities.set("c1", identity());
    const { state } = await start();
    const res = await callback({ code: "c1", state });
    expect(res.headers.location).toBe("/?google_error=google_failed");
    expect(await userCount()).toBe(0);
  });

  it("người dùng bấm Huỷ ở Google (error=access_denied) → google_failed", async () => {
    const { cookie, state } = await start();
    const res = await callback({ error: "access_denied", state }, cookie);
    expect(res.headers.location).toBe("/?google_error=google_failed");
  });

  it("Google từ chối code → google_failed", async () => {
    google.failExchange = true;
    const res = await signIn(identity());
    expect(res.headers.location).toBe("/?google_error=google_failed");
    expect(await userCount()).toBe(0);
  });

  it("email chưa xác minh → google_failed, không tạo user", async () => {
    const res = await signIn(identity({ emailVerified: false }));
    expect(res.headers.location).toBe("/?google_error=google_failed");
    expect(res.headers["set-cookie"]?.toString()).not.toContain(
      "credflow_session=",
    );
    expect(await userCount()).toBe(0);
  });

  it("email trùng tài khoản mật khẩu → email_exists, không liên kết", async () => {
    const existing = makeUser({ email: "ana.thu@gmail.com" });
    await db.insert(users).values(existing);
    const res = await signIn(identity());
    expect(res.headers.location).toBe("/?google_error=email_exists");
    const [row] = await db
      .select()
      .from(users)
      .where(eq(users.id, existing.id));
    expect(row?.googleSub).toBeNull();
    expect(await userCount()).toBe(1);
  });

  it("quá SIGNUP_DAILY_CAP → signup_closed; tài khoản cũ vẫn đăng nhập được", async () => {
    for (const n of [1, 2, 3]) {
      const res = await signIn(
        identity({ sub: `sub-${String(n)}`, email: `u${String(n)}@gmail.com` }),
      );
      expect(res.headers.location).toBe("/");
    }
    const fourth = await signIn(
      identity({ sub: "sub-4", email: "u4@gmail.com" }),
    );
    expect(fourth.headers.location).toBe("/?google_error=signup_closed");
    expect(await userCount()).toBe(3);

    const old = await signIn(
      identity({ sub: "sub-1", email: "u1@gmail.com" }),
      "c-old",
    );
    expect(old.headers.location).toBe("/");
  });

  it("tài khoản Google đăng nhập bằng mật khẩu → 401 cùng câu với sai mật khẩu", async () => {
    await signIn(identity());
    const res = await http()
      .post("/auth/login")
      .send({ email: "ana.thu@gmail.com", password: TEST_PASSWORD });
    expect(res.status).toBe(401);
    expect(JSON.stringify(res.body)).toContain(
      "Email hoặc mật khẩu không đúng",
    );
  });

  it("DB: reviewer có google_sub hoặc user không có cách đăng nhập nào → CHECK chặn", async () => {
    await expect(
      db.insert(users).values(makeUser({ googleSub: "sub-reviewer" })),
    ).rejects.toMatchObject({
      cause: { code: "23514", constraint: "users_google_staff_check" },
    });
    await expect(
      db.insert(users).values(makeUser({ passwordHash: null })),
    ).rejects.toMatchObject({
      cause: { code: "23514", constraint: "users_login_method_check" },
    });
    // Staff mật khẩu bình thường vẫn tạo được.
    await createUser(db, "staff");
  });
});

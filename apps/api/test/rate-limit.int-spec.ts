import type { INestApplication } from "@nestjs/common";
import { ApiError } from "@credflow/contracts";
import { readdir } from "node:fs/promises";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "../src/db/db.provider.js";
import { documents } from "../src/db/schema.js";
import { createUser, TEST_PASSWORD, sessionCookie } from "./auth.js";
import { makeDocument, truncateAll } from "./db.js";
import { samplePng, tmpDir, uploadFile } from "./upload.js";

// Plan 34: giới hạn đăng nhập theo email, upload theo user, trần upload mỗi ngày.
// Giới hạn thấp chỉ trong file này. ConfigModule đọc env lúc nạp AppModule, nên đặt env trước
// rồi mới import động (các file test khác dùng giới hạn rất cao trong test-env.ts).
const LIMITS = {
  LOGIN_RATE_LIMIT: "5",
  LOGIN_RATE_WINDOW_MIN: "15",
  UPLOAD_RATE_PER_HOUR: "10",
  DAILY_UPLOAD_CAP: "12",
};

describe("Rate limit và trần upload (plan 34)", () => {
  let app: INestApplication;
  let db: Db;
  const saved: Record<string, string | undefined> = {};

  beforeAll(async () => {
    for (const [k, v] of Object.entries(LIMITS)) {
      saved[k] = process.env[k];
      process.env[k] = v;
    }
    const { Test } = await import("@nestjs/testing");
    const { AppModule } = await import("../src/app.module.js");
    const { DB } = await import("../src/db/db.provider.js");
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
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
  });

  const login = (email: string, password: string) =>
    request(app.getHttpServer()).post("/auth/login").send({ email, password });

  it("đăng nhập: lần 6 trong cửa sổ với cùng email → 429 TOO_MANY_REQUESTS; email khác không bị chặn", async () => {
    const victim = await createUser(db, "reviewer");
    const other = await createUser(db, "reviewer");

    for (let i = 0; i < 5; i += 1) {
      expect((await login(victim.email, "sai-mat-khau")).status).toBe(401);
    }
    const blocked = await login(victim.email.toUpperCase(), TEST_PASSWORD);
    expect(blocked.status).toBe(429);
    expect(ApiError.parse(blocked.body).code).toBe("TOO_MANY_REQUESTS");

    expect((await login(other.email, "sai-mat-khau")).status).toBe(401);
    expect((await login(other.email, TEST_PASSWORD)).status).toBe(200);
  });

  it("upload: lần 11 trong giờ của cùng user → 429; user khác vẫn upload được", async () => {
    const a = await createUser(db, "staff");
    const b = await createUser(db, "staff");
    const cookieA = sessionCookie(await login(a.email, TEST_PASSWORD));
    const cookieB = sessionCookie(await login(b.email, TEST_PASSWORD));

    for (let i = 0; i < 10; i += 1) {
      const res = await uploadFile(
        app,
        cookieA,
        samplePng(`rl-a-${String(i)}`),
      );
      expect(res.status).toBe(201);
    }
    const blocked = await uploadFile(app, cookieA, samplePng("rl-a-10"));
    expect(blocked.status).toBe(429);
    expect(ApiError.parse(blocked.body).code).toBe("TOO_MANY_REQUESTS");

    expect((await uploadFile(app, cookieB, samplePng("rl-b-0"))).status).toBe(
      201,
    );
  });

  it("trần ngày: đủ 12 giấy hôm nay → upload mới 429, không ghi file tạm", async () => {
    const owner = await createUser(db, "staff");
    if (owner.staffId === null) throw new Error("staff thiếu staffId");
    await db
      .insert(documents)
      .values(
        Array.from({ length: 12 }, () => makeDocument(owner.staffId ?? "")),
      );
    const cookie = sessionCookie(await login(owner.email, TEST_PASSWORD));
    const before = await readdir(tmpDir).catch(() => []);

    const res = await uploadFile(app, cookie, samplePng("over-cap"));
    expect(res.status).toBe(429);
    expect(ApiError.parse(res.body).code).toBe("TOO_MANY_REQUESTS");
    expect(await readdir(tmpDir).catch(() => [])).toEqual(before);
  });

  it("trần ngày chỉ đếm giấy tạo hôm nay (UTC)", async () => {
    const owner = await createUser(db, "staff");
    const yesterday = new Date(Date.now() - 26 * 60 * 60 * 1000);
    await db
      .insert(documents)
      .values(
        Array.from({ length: 12 }, () =>
          makeDocument(owner.staffId ?? "", { createdAt: yesterday }),
        ),
      );
    const cookie = sessionCookie(await login(owner.email, TEST_PASSWORD));
    expect((await uploadFile(app, cookie, samplePng("today-ok"))).status).toBe(
      201,
    );
  });
});

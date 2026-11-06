import { Test, type TestingModule } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ApiError, type AuthUser } from "@credflow/contracts";
import { AppModule } from "../src/app.module.js";
import { type Db, DB } from "../src/db/db.provider.js";
import { documents } from "../src/db/schema.js";
import { createUser, sessionCookie, TEST_PASSWORD } from "./auth.js";
import { makeProcessedDocument, truncateAll } from "./db.js";
import { filesDir, samplePng } from "./upload.js";

describe("GET file gốc (plan 27)", () => {
  let app: INestApplication;
  let db: Db;

  const login = async (role: AuthUser["role"]) => {
    const user = await createUser(db, role);
    const res = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: user.email, password: TEST_PASSWORD });
    return { user, cookie: sessionCookie(res) };
  };
  const get = (path: string, cookie: string) =>
    request(app.getHttpServer())
      .get(path)
      .set("Cookie", cookie)
      .buffer(true)
      .parse((res, done) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => done(null, Buffer.concat(chunks)));
      });

  /** Giấy của staff kèm file thật trong storage test. */
  async function seedWithFile(staffId: string, label: string) {
    const doc = makeProcessedDocument(staffId, "needs_review");
    const content = samplePng(label);
    const path = join(filesDir, doc.storageKey);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content);
    await db.insert(documents).values(doc);
    return { doc, content, path };
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
    db = app.get(DB);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await truncateAll(db);
  });

  it("reviewer xem file của bất kỳ staff: đúng byte, Content-Type đã lưu, nosniff", async () => {
    const owner = await login("staff");
    const { doc, content } = await seedWithFile(
      owner.user.staffId ?? "",
      "review-file-1",
    );
    const { cookie } = await login("reviewer");

    const res = await get(`/review/documents/${doc.id}/file`, cookie);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("image/png");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["content-disposition"]).toBe("inline");
    expect(Buffer.compare(res.body as Buffer, content)).toBe(0);
  });

  it("staff xem file giấy của mình 200; giấy staff khác → 404 như id không có", async () => {
    const owner = await login("staff");
    const other = await login("staff");
    const { doc, content } = await seedWithFile(
      owner.user.staffId ?? "",
      "review-file-2",
    );

    const mine = await get(`/documents/${doc.id}/file`, owner.cookie);
    expect(mine.status).toBe(200);
    expect(Buffer.compare(mine.body as Buffer, content)).toBe(0);

    const notMine = await request(app.getHttpServer())
      .get(`/documents/${doc.id}/file`)
      .set("Cookie", other.cookie);
    const missing = await request(app.getHttpServer())
      .get(`/documents/01TESTDOCKHONGCO00000000/file`)
      .set("Cookie", other.cookie);
    expect(notMine.status).toBe(404);
    expect(notMine.body).toEqual(missing.body);
  });

  it("staff gọi route file của reviewer → 403", async () => {
    const owner = await login("staff");
    const { doc } = await seedWithFile(
      owner.user.staffId ?? "",
      "review-file-3",
    );
    const res = await request(app.getHttpServer())
      .get(`/review/documents/${doc.id}/file`)
      .set("Cookie", owner.cookie);
    expect(res.status).toBe(403);
    expect(ApiError.parse(res.body).code).toBe("FORBIDDEN");
  });

  it("file mất khỏi storage → 404 JSON, không 500", async () => {
    const owner = await login("staff");
    const { doc, path } = await seedWithFile(
      owner.user.staffId ?? "",
      "review-file-4",
    );
    await rm(path);
    const { cookie } = await login("reviewer");
    const res = await request(app.getHttpServer())
      .get(`/review/documents/${doc.id}/file`)
      .set("Cookie", cookie);
    expect(res.status).toBe(404);
    expect(ApiError.parse(res.body).code).toBe("NOT_FOUND");
  });
});

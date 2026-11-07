import { Test, type TestingModule } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  ApiError,
  type AuthUser,
  DocumentList,
  DocumentView,
  type UserRole,
} from "@credflow/contracts";
import { AppModule } from "../src/app.module.js";
import { type Db, DB } from "../src/db/db.provider.js";
import { documents, reviewActions } from "../src/db/schema.js";
import { createUser, sessionCookie, TEST_PASSWORD } from "./auth.js";
import { makeDocument, makeProcessedDocument, truncateAll } from "./db.js";

/** Không có giấy nào mang id này. */
const MISSING_ID = "01TESTDOCKHONGCO00000000";

describe("GET /documents, GET /documents/:id", () => {
  let app: INestApplication;
  let db: Db;

  const login = async (role: UserRole) => {
    const user = await createUser(db, role);
    const res = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: user.email, password: TEST_PASSWORD });
    return { user, cookie: sessionCookie(res) };
  };

  const staffIdOf = (user: AuthUser) => {
    if (user.staffId === null) throw new Error("user không phải staff");
    return user.staffId;
  };

  const get = (path: string, cookie?: string) => {
    const req = request(app.getHttpServer()).get(path);
    return cookie === undefined ? req : req.set("Cookie", cookie);
  };

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

  it.each(["/documents", `/documents/${MISSING_ID}`])(
    "chưa đăng nhập: %s → 401",
    async (path) => {
      const res = await get(path);
      expect(res.status).toBe(401);
      expect(ApiError.parse(res.body).code).toBe("UNAUTHORIZED");
    },
  );

  it.each([["reviewer"], ["admin"]] as const)(
    "%s gọi route đọc của staff → 403",
    async (role) => {
      const { cookie } = await login(role);
      for (const path of ["/documents", `/documents/${MISSING_ID}`]) {
        const res = await get(path, cookie);
        expect(res.status).toBe(403);
        expect(ApiError.parse(res.body).code).toBe("FORBIDDEN");
      }
    },
  );

  it("list: chỉ giấy của mình, mới nhất trước, không có storageKey/checksum", async () => {
    const a = await login("staff");
    const b = await login("staff");
    const older = makeDocument(staffIdOf(a.user), {
      createdAt: new Date("2026-11-01T00:00:00Z"),
    });
    const newer = makeProcessedDocument(staffIdOf(a.user), "auto_approved", {
      createdAt: new Date("2026-11-05T00:00:00Z"),
    });
    const others = makeDocument(staffIdOf(b.user));
    await db.insert(documents).values([older, newer, others]);

    const res = await get("/documents", a.cookie);

    expect(res.status).toBe(200);
    const body = DocumentList.parse(res.body);
    expect(body.items.map((d) => d.id)).toEqual([newer.id, older.id]);
    expect(body.items[0]?.asOf).toBe("2026-11-06");
    for (const item of res.body.items as Record<string, unknown>[]) {
      expect(item).not.toHaveProperty("storageKey");
      expect(item).not.toHaveProperty("checksum");
    }
  });

  it("list: chưa nộp giấy nào → items rỗng", async () => {
    const { cookie } = await login("staff");
    const res = await get("/documents", cookie);
    expect(res.status).toBe(200);
    expect(DocumentList.parse(res.body)).toEqual({ items: [] });
  });

  it("chi tiết giấy của mình: đủ kết quả pipeline, không có storageKey/checksum", async () => {
    const { user, cookie } = await login("staff");
    const doc = makeProcessedDocument(staffIdOf(user), "auto_approved");
    await db.insert(documents).values(doc);

    const res = await get(`/documents/${doc.id}`, cookie);

    expect(res.status).toBe(200);
    const body = DocumentView.parse(res.body);
    expect(body).toMatchObject({
      id: doc.id,
      status: "auto_approved",
      asOf: "2026-11-06",
      routing: { decision: "auto_approve", reasons: [] },
    });
    expect(body.extraction?.docType).toBe("cpr_card");
    expect(res.body).not.toHaveProperty("storageKey");
    expect(res.body).not.toHaveProperty("checksum");
  });

  it("giấy của người khác và id không tồn tại: cùng 404, body giống nhau", async () => {
    const a = await login("staff");
    const b = await login("staff");
    const others = makeDocument(staffIdOf(b.user));
    await db.insert(documents).values(others);

    const foreign = await get(`/documents/${others.id}`, a.cookie);
    const missing = await get(`/documents/${MISSING_ID}`, a.cookie);

    expect(foreign.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(ApiError.parse(foreign.body).code).toBe("NOT_FOUND");
    expect(foreign.body).toEqual(missing.body);
  });
  it("plan 28: giấy đã có người duyệt → lastReview là quyết định mới nhất, không lộ reviewerId; chưa duyệt → vắng", async () => {
    const { user, cookie } = await login("staff");
    const reviewer = await createUser(db, "reviewer");
    const reviewed = makeProcessedDocument(
      staffIdOf(user),
      "reupload_requested",
    );
    const pending = makeProcessedDocument(staffIdOf(user), "needs_review");
    await db.insert(documents).values([reviewed, pending]);
    // Hai lần ghi để kiểm "mới nhất": lần đầu cũ hơn, lần sau là quyết định đang có hiệu lực.
    await db.insert(reviewActions).values([
      {
        id: "01TESTREVACT0001",
        documentId: reviewed.id,
        reviewerId: reviewer.id,
        action: "reject",
        note: "Lý do cũ (SAMPLE)",
        createdAt: new Date("2026-11-01T08:00:00Z"),
      },
      {
        id: "01TESTREVACT0002",
        documentId: reviewed.id,
        reviewerId: reviewer.id,
        action: "request_reupload",
        note: "Ảnh mờ, nộp lại (SAMPLE)",
        createdAt: new Date("2026-11-02T08:00:00Z"),
      },
    ]);

    const detail = await get(`/documents/${reviewed.id}`, cookie);
    expect(detail.status).toBe(200);
    expect(detail.body).toHaveProperty("lastReview", {
      action: "request_reupload",
      note: "Ảnh mờ, nộp lại (SAMPLE)",
      decidedAt: "2026-11-02T08:00:00.000Z",
    });
    expect(JSON.stringify(detail.body)).not.toContain(reviewer.id);

    const list = DocumentList.parse((await get("/documents", cookie)).body);
    const byId = new Map(list.items.map((d) => [d.id, d]));
    expect(byId.get(reviewed.id)?.lastReview?.action).toBe("request_reupload");
    expect(byId.get(pending.id)).not.toHaveProperty("lastReview");
  });
});

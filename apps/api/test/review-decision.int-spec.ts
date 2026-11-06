import { Test, type TestingModule } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  ApiError,
  DecisionResponse,
  PreviewResponse,
  ReviewDocumentDetail,
} from "@credflow/contracts";
import { eq, sql } from "drizzle-orm";
import { AppModule } from "../src/app.module.js";
import { type Db, DB } from "../src/db/db.provider.js";
import { documents, reviewActions, staff } from "../src/db/schema.js";
import { ReviewActionsRepository } from "../src/review/review-actions.repository.js";
import { loginAs } from "./auth.js";
import { makeProcessedDocument, makeStaff, truncateAll } from "./db.js";
import { needsReviewDocument } from "./review.js";

const MISSING_ID = "01TESTDOCKHONGCO00000000";

describe("POST /review/documents/:id/decision, /preview (plan 27)", () => {
  let app: INestApplication;
  let db: Db;
  let reviewer: string;
  let staffId: string;

  const post = (path: string, body: object, cookie = reviewer) =>
    request(app.getHttpServer()).post(path).set("Cookie", cookie).send(body);
  const decide = (id: string, body: object, cookie = reviewer) =>
    post(`/review/documents/${id}/decision`, body, cookie);

  async function row(id: string) {
    const [doc] = await db.select().from(documents).where(eq(documents.id, id));
    if (doc === undefined) throw new Error("không có document");
    return doc;
  }
  const actionsOf = (id: string) =>
    db.select().from(reviewActions).where(eq(reviewActions.documentId, id));

  async function seed(opts: Parameters<typeof needsReviewDocument>[1] = {}) {
    const doc = needsReviewDocument(staffId, opts);
    await db.insert(documents).values(doc);
    return doc;
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
    reviewer = await loginAs(app, db, "reviewer");
    // Staff có tên khớp fixture để NAME_MISMATCH qua trong preview.
    const profile = makeStaff({ legalName: "Jane Q. Doe" });
    await db.insert(staff).values(profile);
    staffId = profile.id;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("duyệt có sửa: approved, version +1, 1 review_action có before từ extraction gốc, extraction không đổi", async () => {
    const doc = await seed({ reasons: ["DATE_INCONSISTENT"] });
    const res = await decide(doc.id, {
      action: "approve",
      version: 1,
      corrections: [
        {
          fieldPath: "fields.expirationDate.value",
          before: "2028-04-19",
          after: "2028-05-19",
        },
      ],
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const body = DecisionResponse.parse(res.body);
    expect(body.document.status).toBe("approved");
    expect(body.document.version).toBe(2);
    expect(body.reviewAction.corrections).toEqual([
      {
        fieldPath: "fields.expirationDate.value",
        before: "2028-04-19",
        after: "2028-05-19",
      },
    ]);

    const saved = await row(doc.id);
    expect(saved.status).toBe("approved");
    expect(saved.version).toBe(2);
    expect(saved.extraction).toEqual(doc.extraction);
    const actions = await actionsOf(doc.id);
    expect(actions).toHaveLength(1);
    expect(actions[0]?.action).toBe("approve");

    const detail = ReviewDocumentDetail.parse(
      (
        await request(app.getHttpServer())
          .get(`/review/documents/${doc.id}`)
          .set("Cookie", reviewer)
      ).body,
    );
    expect(detail.reviewActions.map((a) => a.id)).toEqual([
      body.reviewAction.id,
    ]);
    expect(detail.staff.legalName).toBe("Jane Q. Doe");
  });

  it.each([
    ["reject", "rejected"],
    ["request_reupload", "reupload_requested"],
  ] as const)("%s có note → %s, note được lưu", async (action, status) => {
    const doc = await seed();
    const res = await decide(doc.id, {
      action,
      version: 1,
      note: "Ảnh mờ (SAMPLE)",
    });
    expect(res.status).toBe(200);
    expect((await row(doc.id)).status).toBe(status);
    expect((await actionsOf(doc.id))[0]?.note).toBe("Ảnh mờ (SAMPLE)");
  });

  it.each(["reject", "request_reupload"])(
    "%s thiếu note → 400, DB không đổi",
    async (action) => {
      const doc = await seed();
      const res = await decide(doc.id, { action, version: 1 });
      expect(res.status).toBe(400);
      expect(ApiError.parse(res.body).code).toBe("VALIDATION_FAILED");
      const saved = await row(doc.id);
      expect(saved.status).toBe("needs_review");
      expect(saved.version).toBe(1);
      expect(await actionsOf(doc.id)).toHaveLength(0);
    },
  );

  it("2 request song song cùng version: đúng 1 thắng (200), 1 nhận 409; 1 review_action; version +1", async () => {
    const doc = await seed();
    const secondReviewer = await loginAs(app, db, "reviewer");
    const [a, b] = await Promise.all([
      decide(doc.id, { action: "approve", version: 1 }),
      decide(
        doc.id,
        { action: "reject", version: 1, note: "Sai tên" },
        secondReviewer,
      ),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const loser = a.status === 409 ? a : b;
    expect(ApiError.parse(loser.body).code).toBe("CONFLICT");
    expect(await actionsOf(doc.id)).toHaveLength(1);
    expect((await row(doc.id)).version).toBe(2);
  });

  it("version cũ trong khi vẫn needs_review (worker/sweep đã ghi lại) → 409, không ghi gì", async () => {
    const doc = await seed();
    // Giả lập một lần đổi trạng thái khác đã tăng version mà ca vẫn ở needs_review.
    await db.execute(
      sql`UPDATE documents SET version = version + 1 WHERE id = ${doc.id}`,
    );
    const res = await decide(doc.id, { action: "approve", version: 1 });
    expect(res.status).toBe(409);
    expect((await row(doc.id)).status).toBe("needs_review");
    expect(await actionsOf(doc.id)).toHaveLength(0);
  });

  it.each(["auto_approved", "approved"] as const)(
    "ca %s (không còn chờ duyệt) → 409",
    async (status) => {
      const doc = makeProcessedDocument(staffId, status);
      await db.insert(documents).values(doc);
      const res = await decide(doc.id, { action: "approve", version: 1 });
      expect(res.status).toBe(409);
      expect((await row(doc.id)).status).toBe(status);
    },
  );

  it("không có giấy → 404", async () => {
    const res = await decide(MISSING_ID, { action: "approve", version: 1 });
    expect(res.status).toBe(404);
  });

  it("insert review_actions lỗi → rollback: status, version không đổi", async () => {
    const doc = await seed();
    vi.spyOn(ReviewActionsRepository.prototype, "insert").mockRejectedValueOnce(
      new Error("ép lỗi giữa transaction"),
    );
    const res = await decide(doc.id, { action: "approve", version: 1 });
    expect(res.status).toBe(500);
    const saved = await row(doc.id);
    expect(saved.status).toBe("needs_review");
    expect(saved.version).toBe(1);
    expect(await actionsOf(doc.id)).toHaveLength(0);
  });

  it.each([
    [
      "trường không có",
      { fieldPath: "fields.khongCo.value", before: null, after: "x" },
    ],
    [
      "ngày sai định dạng",
      {
        fieldPath: "fields.expirationDate.value",
        before: "2028-04-19",
        after: "09/02/2025",
      },
    ],
    [
      "before lệch giá trị gốc",
      {
        fieldPath: "fields.expirationDate.value",
        before: "2027-01-01",
        after: "2028-05-19",
      },
    ],
  ])("correction %s → 400, DB không đổi", async (_name, correction) => {
    const doc = await seed();
    const res = await decide(doc.id, {
      action: "approve",
      version: 1,
      corrections: [correction],
    });
    expect(res.status).toBe(400);
    expect(ApiError.parse(res.body).code).toBe("VALIDATION_FAILED");
    expect((await row(doc.id)).status).toBe("needs_review");
    expect(await actionsOf(doc.id)).toHaveLength(0);
  });

  it("CHECK documents_version_check: version = 0 bị DB từ chối", async () => {
    const doc = await seed();
    await expect(
      db.execute(sql`UPDATE documents SET version = 0 WHERE id = ${doc.id}`),
    ).rejects.toMatchObject({ cause: { code: "23514" } });
  });

  it("staff gọi decision → 403", async () => {
    const doc = await seed();
    const staffCookie = await loginAs(app, db, "staff");
    const res = await decide(
      doc.id,
      { action: "approve", version: 1 },
      staffCookie,
    );
    expect(res.status).toBe(403);
    expect((await row(doc.id)).status).toBe("needs_review");
  });

  describe("preview", () => {
    it("sửa hạn của ca EXPIRED thành sau asOf → EXPIRED qua; dùng asOf đã lưu; DB không đổi", async () => {
      const doc = await seed({
        expirationDate: "2026-06-01",
        reasons: ["EXPIRED"],
        asOf: "2026-11-06",
      });
      const before = await row(doc.id);

      const plain = await post(`/review/documents/${doc.id}/preview`, {});
      expect(plain.status, JSON.stringify(plain.body)).toBe(200);
      const plainBody = PreviewResponse.parse(plain.body);
      expect(plainBody.asOf).toBe("2026-11-06");
      expect(
        plainBody.ruleResults.find((r) => r.code === "EXPIRED")?.passed,
      ).toBe(false);

      const fixed = await post(`/review/documents/${doc.id}/preview`, {
        corrections: [
          {
            fieldPath: "fields.expirationDate.value",
            before: "2026-06-01",
            after: "2028-04-19",
          },
        ],
      });
      expect(fixed.status).toBe(200);
      const fixedBody = PreviewResponse.parse(fixed.body);
      expect(
        fixedBody.ruleResults.find((r) => r.code === "EXPIRED")?.passed,
      ).toBe(true);

      const after = await row(doc.id);
      expect(after.version).toBe(before.version);
      expect(after.updatedAt).toEqual(before.updatedAt);
      expect(after.extraction).toEqual(before.extraction);
      expect(await actionsOf(doc.id)).toHaveLength(0);
    });

    it("ca chưa có kết quả trích xuất → 409; correction sai → 400", async () => {
      const failed = makeProcessedDocument(staffId, "failed");
      await db.insert(documents).values(failed);
      expect(
        (await post(`/review/documents/${failed.id}/preview`, {})).status,
      ).toBe(409);

      const doc = await seed();
      const res = await post(`/review/documents/${doc.id}/preview`, {
        corrections: [
          { fieldPath: "fields.khongCo.value", before: null, after: "x" },
        ],
      });
      expect(res.status).toBe(400);
    });
  });
});

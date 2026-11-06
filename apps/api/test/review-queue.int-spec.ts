import { Test, type TestingModule } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ApiError, ReviewQueuePage } from "@credflow/contracts";
import { sql } from "drizzle-orm";
import { AppModule } from "../src/app.module.js";
import { type Db, DB } from "../src/db/db.provider.js";
import { documents, staff } from "../src/db/schema.js";
import { loginAs } from "./auth.js";
import { makeProcessedDocument, makeStaff, truncateAll } from "./db.js";
import { needsReviewDocument } from "./review.js";

describe("GET /review/queue (plan 27)", () => {
  let app: INestApplication;
  let db: Db;
  let reviewer: string;
  let staffId: string;

  const queue = (query: Record<string, string> = {}) =>
    request(app.getHttpServer())
      .get("/review/queue")
      .query(query)
      .set("Cookie", reviewer);

  /** Đi hết các trang, trả id theo thứ tự. `between` chạy sau trang đầu (để đổi dữ liệu giữa chừng). */
  async function allPages(
    query: Record<string, string>,
    between?: (firstPage: string[]) => Promise<void>,
  ): Promise<string[]> {
    const ids: string[] = [];
    let cursor: string | null = null;
    let page = 0;
    do {
      const res = await queue(cursor === null ? query : { ...query, cursor });
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      const body = ReviewQueuePage.parse(res.body);
      const pageIds = body.items.map((i) => i.id);
      ids.push(...pageIds);
      cursor = body.nextCursor;
      if (page === 0 && between !== undefined) await between(pageIds);
      page += 1;
      if (page > 50) throw new Error("vòng lặp phân trang không dừng");
    } while (cursor !== null);
    return ids;
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
    const profile = makeStaff({ legalName: "Avery Testwood (SAMPLE)" });
    await db.insert(staff).values(profile);
    staffId = profile.id;
  });

  /** 25 ca có hạn (thứ tự hạn ngược với thứ tự tạo) + 3 ca không hạn + ca ở trạng thái khác. */
  async function seedQueue() {
    const dated = Array.from({ length: 25 }, (_, i) => {
      const day = String(25 - i).padStart(2, "0");
      return needsReviewDocument(staffId, {
        expirationDate: `2027-01-${day}`,
        reasons: i % 2 === 0 ? ["EXPIRED"] : ["ISSUER_NOT_ACCEPTED"],
        createdAt: new Date(Date.UTC(2026, 10, 1, 0, 0, i)),
      });
    });
    const undated = Array.from({ length: 3 }, (_, i) =>
      needsReviewDocument(staffId, {
        expirationDate: null,
        reasons: ["MISSING_FIELD"],
        createdAt: new Date(Date.UTC(2026, 10, 2, 0, 0, i)),
      }),
    );
    const others = [
      makeProcessedDocument(staffId, "auto_approved"),
      makeProcessedDocument(staffId, "approved"),
      makeProcessedDocument(staffId, "failed"),
    ];
    await db.insert(documents).values([...dated, ...undated, ...others]);
    return { dated, undated };
  }

  it("staff gọi /review/queue → 403; chưa đăng nhập → 401", async () => {
    const staffCookie = await loginAs(app, db, "staff");
    const asStaff = await request(app.getHttpServer())
      .get("/review/queue")
      .set("Cookie", staffCookie);
    expect(asStaff.status).toBe(403);
    expect(ApiError.parse(asStaff.body).code).toBe("FORBIDDEN");
    const anon = await request(app.getHttpServer()).get("/review/queue");
    expect(anon.status).toBe(401);
  });

  it("sort=due (mặc định): hạn gần nhất trước, không có hạn xuống cuối, chỉ needs_review", async () => {
    const { dated, undated } = await seedQueue();
    const res = await queue({ limit: "100" });
    expect(res.status).toBe(200);
    const body = ReviewQueuePage.parse(res.body);
    expect(body.nextCursor).toBeNull();
    expect(body.items).toHaveLength(28);

    const dueDates = body.items.map((i) => i.dueDate);
    expect(dueDates.slice(0, 25)).toEqual(
      [...dated].reverse().map((d) => {
        if (d.extraction?.docType !== "cpr_card") throw new Error("CPR");
        return d.extraction.fields.expirationDate.value;
      }),
    );
    expect(dueDates.slice(25)).toEqual([null, null, null]);
    expect(new Set(body.items.slice(25).map((i) => i.id))).toEqual(
      new Set(undated.map((d) => d.id)),
    );
    const first = body.items[0];
    expect(first?.staffName).toBe("Avery Testwood (SAMPLE)");
    expect(first?.docType).toBe("cpr_card");
    expect(first?.version).toBe(1);
    expect(first).not.toHaveProperty("sortKey");
  });

  it("sort=submitted: nộp sớm nhất trước", async () => {
    const { dated, undated } = await seedQueue();
    const ids = await allPages({ sort: "submitted", limit: "7" });
    expect(ids).toEqual([...dated, ...undated].map((d) => d.id));
  });

  it("lọc reason: chỉ ca có lý do đó", async () => {
    const { dated } = await seedQueue();
    const ids = await allPages({ reason: "EXPIRED", limit: "4" });
    const expected = dated
      .filter((d) => d.routing?.reasons.includes("EXPIRED"))
      .reverse()
      .map((d) => d.id);
    expect(ids).toEqual(expected);
    expect(ids).toHaveLength(13);
  });

  it("keyset: đi hết trang ra đúng tập, không trùng; duyệt 1 ca trang 1 giữa chừng cũng không sót", async () => {
    await seedQueue();
    const full = await allPages({ limit: "10" });
    expect(full).toHaveLength(28);
    expect(new Set(full).size).toBe(28);

    let removed: string | undefined;
    const ids = await allPages({ limit: "10" }, async (firstPage) => {
      removed = firstPage[3];
      await db.execute(
        sql`UPDATE documents SET status = 'approved', version = version + 1 WHERE id = ${removed}`,
      );
    });
    // Offset sẽ trượt 1 dòng và sót ca thứ 11; keyset thì đủ 27 ca còn lại (ca đã duyệt nằm ở trang 1).
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(full);
    expect(ids).toContain(removed);
    const after = await allPages({ limit: "10" });
    expect(after).toEqual(full.filter((id) => id !== removed));
  });

  it("cursor hỏng, hoặc của sort khác → 400 VALIDATION_FAILED", async () => {
    await seedQueue();
    const first = ReviewQueuePage.parse((await queue({ limit: "5" })).body);
    expect(first.nextCursor).not.toBeNull();

    const queries: Record<string, string>[] = [
      { cursor: "khong-phai-cursor" },
      { cursor: first.nextCursor ?? "", sort: "submitted" },
      { cursor: first.nextCursor ?? "", reason: "EXPIRED" },
    ];
    for (const query of queries) {
      const res = await queue(query);
      expect(res.status).toBe(400);
      expect(ApiError.parse(res.body).code).toBe("VALIDATION_FAILED");
    }
  });

  it("query lạ, reason lạ, limit quá lớn → 400", async () => {
    const queries: Record<string, string>[] = [
      { status: "approved" },
      { reason: "FOO" },
      { limit: "1000" },
    ];
    for (const query of queries) {
      expect((await queue(query)).status).toBe(400);
    }
  });

  it("EXPLAIN: hàng chờ sort=due dùng index documents_review_queue_due_idx", async () => {
    // Ít dòng thì planner chọn Seq Scan dù có index; tắt seqscan để kiểm index khớp biểu thức.
    await seedQueue();
    const plan = await db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL enable_seqscan = off`);
      return tx.execute(sql`EXPLAIN SELECT id FROM documents
        WHERE status = 'needs_review'
        ORDER BY COALESCE(extraction -> 'fields' -> 'expirationDate' ->> 'value', '9999-12-31'), id
        LIMIT 21`);
    });
    const text = plan.rows.map((r) => String(Object.values(r)[0])).join("\n");
    expect(text).toContain("documents_review_queue_due_idx");
  });
});

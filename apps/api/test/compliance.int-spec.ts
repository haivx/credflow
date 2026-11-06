import { Test, type TestingModule } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import { StaffCompliance } from "@credflow/contracts";
import { desc, eq, sql } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module.js";
import { type Db, DB } from "../src/db/db.provider.js";
import { documents, staff } from "../src/db/schema.js";
import { presentDocTypesQuery } from "../src/staff/compliance.sql.js";
import { loginAs } from "./auth.js";
import {
  createTestDb,
  makeProcessedDocument,
  makeStaff,
  truncateAll,
} from "./db.js";

// Plan 26: staff đã đủ bộ giấy chưa. Config default: caregiver cần cpr_card, tb_test,
// background_check, vaccination_record.

const classified = (
  docType: "cpr_card" | "tb_test" | "background_check" | "vaccination_record",
) => ({
  classification: { docType, confidence: 0.95 },
});

describe("GET /staff/:id/compliance", () => {
  let app: INestApplication;
  let db: Db;
  let reviewer: string;

  const get = (id: string, cookie?: string) => {
    const req = request(app.getHttpServer()).get(`/staff/${id}/compliance`);
    return cookie === undefined ? req : req.set("Cookie", cookie);
  };

  const addStaff = async (role = "caregiver") => {
    const row = makeStaff({ role });
    await db.insert(staff).values(row);
    return row.id;
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
    reviewer = await loginAs(app, db, "reviewer");
  });

  it("chỉ tính giấy auto_approved/approved; needs_review, rejected không tính", async () => {
    const id = await addStaff();
    await db
      .insert(documents)
      .values([
        makeProcessedDocument(id, "auto_approved", classified("cpr_card")),
        makeProcessedDocument(id, "needs_review", classified("tb_test")),
        makeProcessedDocument(id, "rejected", classified("background_check")),
      ]);

    const res = await get(id, reviewer);

    expect(res.status).toBe(200);
    expect(StaffCompliance.parse(res.body)).toEqual({
      staffId: id,
      role: "caregiver",
      status: "incomplete",
      required: [
        "cpr_card",
        "tb_test",
        "background_check",
        "vaccination_record",
      ],
      present: ["cpr_card"],
      missing: ["tb_test", "background_check", "vaccination_record"],
      configs: ["default"],
    });
  });

  it("đủ 4 loại (approved hoặc auto_approved): complete", async () => {
    const id = await addStaff();
    await db
      .insert(documents)
      .values([
        makeProcessedDocument(id, "auto_approved", classified("cpr_card")),
        makeProcessedDocument(id, "approved", classified("tb_test")),
        makeProcessedDocument(id, "approved", classified("background_check")),
        makeProcessedDocument(
          id,
          "auto_approved",
          classified("vaccination_record"),
        ),
      ]);

    const body = StaffCompliance.parse((await get(id, reviewer)).body);

    expect(body.status).toBe("complete");
    expect(body.missing).toEqual([]);
  });

  it("vai trò không có trong config: unknown_role, không bao giờ complete", async () => {
    const id = await addStaff("janitor");
    const body = StaffCompliance.parse((await get(id, reviewer)).body);
    expect(body).toMatchObject({
      status: "unknown_role",
      required: [],
      missing: [],
    });
  });

  it("phân quyền: chưa đăng nhập 401, staff 403, admin 200, id không có 404", async () => {
    const id = await addStaff();
    expect((await get(id)).status).toBe(401);
    expect((await get(id, await loginAs(app, db, "staff"))).status).toBe(403);
    expect((await get(id, await loginAs(app, db, "admin"))).status).toBe(200);
    expect((await get("01KHONGCO0000000000000000", reviewer)).status).toBe(404);
  });
});

describe("EXPLAIN trên ~20k document (plan 26)", () => {
  const { db, close } = createTestDb();
  let probe: string;

  /** Tên index trong plan JSON của EXPLAIN. */
  const indexNames = (plan: unknown): string[] => {
    const found: string[] = [];
    const walk = (node: unknown) => {
      if (node === null || typeof node !== "object") return;
      for (const [key, value] of Object.entries(node)) {
        if (key === "Index Name" && typeof value === "string")
          found.push(value);
        walk(value);
      }
    };
    walk(plan);
    return found;
  };

  beforeAll(async () => {
    await truncateAll(db);
    // 2000 staff × 10 document; 1/3 đã duyệt (có classification), còn lại vừa upload.
    await db.execute(sql`
      INSERT INTO staff (id, legal_name, role, region)
      SELECT 'EXPSTAFF' || lpad(g::text, 6, '0'), 'Staff ' || g, 'caregiver', 'CA'
      FROM generate_series(1, 2000) g`);
    await db.execute(sql`
      INSERT INTO documents (id, staff_id, file_name, mime_type, storage_key, status, checksum, size_bytes, classification, versions)
      SELECT
        'EXPDOC' || lpad(g::text, 8, '0'),
        'EXPSTAFF' || lpad((1 + g % 2000)::text, 6, '0'),
        'f.png', 'image/png', 'documents/x' || g,
        CASE WHEN g % 3 = 0 THEN 'approved' ELSE 'uploaded' END,
        md5(g::text) || md5('x' || g::text),
        1024,
        CASE WHEN g % 3 = 0 THEN jsonb_build_object('docType', (ARRAY['cpr_card','tb_test','background_check','vaccination_record'])[1 + g % 4], 'confidence', 0.9) END,
        CASE WHEN g % 3 = 0 THEN '{"pipeline":"x","prompt":"x","model":"x","rules":"x"}'::jsonb END
      FROM generate_series(1, 20000) g`);
    await db.execute(sql`ANALYZE staff`);
    await db.execute(sql`ANALYZE documents`);
    probe = "EXPSTAFF000042";
  });

  afterAll(async () => {
    await truncateAll(db);
    await close();
  });

  it("query đủ bộ dùng documents_staff_approved_doctype_idx", async () => {
    const result = await db.execute(
      sql`EXPLAIN (FORMAT JSON) ${presentDocTypesQuery(probe)}`,
    );
    const names = indexNames(result.rows);
    expect(names, JSON.stringify(result.rows)).toContain(
      "documents_staff_approved_doctype_idx",
    );
  });

  it("danh sách giấy của staff (GET /documents) dùng documents_staff_id_idx", async () => {
    const q = db
      .select({ id: documents.id })
      .from(documents)
      .where(eq(documents.staffId, probe))
      .orderBy(desc(documents.createdAt), desc(documents.id))
      .limit(50)
      .toSQL();
    const result = await db.$client.query(
      `EXPLAIN (FORMAT JSON) ${q.sql}`,
      q.params,
    );
    expect(indexNames(result.rows), JSON.stringify(result.rows)).toContain(
      "documents_staff_id_idx",
    );
  });

  it("đối chứng: số dòng đủ lớn để planner có lý do dùng index", async () => {
    const [row] = (
      await db.execute(sql`SELECT count(*)::int AS n FROM documents`)
    ).rows as { n: number }[];
    expect(row?.n).toBe(20000);
  });
});

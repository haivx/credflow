import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { Test, type TestingModule } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ApiError, UploadDocumentResponse } from "@credflow/contracts";
import { AppModule } from "../src/app.module.js";
import { type Db, DB } from "../src/db/db.provider.js";
import { documents } from "../src/db/schema.js";
import { createUser, loginAs, sessionCookie, TEST_PASSWORD } from "./auth.js";
import { truncateAll } from "./db.js";
import {
  filesDir,
  resetDataDir,
  samplePdf,
  samplePng,
  storedKeys,
  tmpDir,
  UPLOAD_MAX_BYTES,
  uploadFile,
} from "./upload.js";

const sha256 = (data: Buffer) =>
  createHash("sha256").update(data).digest("hex");

describe("POST /documents", () => {
  let app: INestApplication;
  let db: Db;
  /** Cookie của staff A và staff B (hai hồ sơ staff khác nhau). */
  let staffA: string;
  let staffB: string;

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
    await resetDataDir();
    staffA = await loginAs(app, db, "staff");
    staffB = await loginAs(app, db, "staff");
  });

  it("staff upload PDF → 201, một dòng uploaded, file nằm trong storage, tmp rỗng", async () => {
    const content = samplePdf("a");

    const res = await uploadFile(app, staffA, content, {
      fileName: "the-cpr-SAMPLE.pdf",
    });

    expect(res.status).toBe(201);
    const body = UploadDocumentResponse.parse(res.body);
    expect(body).toMatchObject({ status: "uploaded", duplicate: false });

    const rows = await db.select().from(documents);
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row).toMatchObject({
      id: body.documentId,
      fileName: "the-cpr-SAMPLE.pdf",
      mimeType: "application/pdf",
      checksum: sha256(content),
      sizeBytes: content.length,
      storageKey: `documents/${body.documentId}.pdf`,
      declaredDocType: null,
    });
    expect(await storedKeys()).toEqual([`documents/${body.documentId}.pdf`]);
    expect(await readFile(join(filesDir, row?.storageKey ?? ""))).toEqual(
      content,
    );
    expect(await readdir(tmpDir)).toEqual([]);
  });

  it("staffId lấy từ session, không phải từ form", async () => {
    const user = await createUser(db, "staff");
    const login = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: user.email, password: TEST_PASSWORD });
    const cookie = sessionCookie(login);

    const res = await uploadFile(app, cookie, samplePdf("own"));

    expect(res.status).toBe(201);
    const [row] = await db.select().from(documents);
    expect(row?.staffId).toBe(user.staffId);
  });

  it("lưu declaredDocType hợp lệ; mimeType lấy theo nội dung file", async () => {
    const res = await uploadFile(app, staffA, samplePng("png"), {
      fileName: "anh.pdf",
      declaredDocType: "cpr_card",
    });

    expect(res.status).toBe(201);
    const [row] = await db.select().from(documents);
    expect(row).toMatchObject({
      declaredDocType: "cpr_card",
      mimeType: "image/png",
    });
    expect(row?.storageKey).toMatch(/\.png$/);
  });

  it("cùng staff upload lại cùng file → 200 duplicate, cùng documentId, vẫn một dòng", async () => {
    const content = samplePdf("dup");
    const first = await uploadFile(app, staffA, content);

    const second = await uploadFile(app, staffA, content, {
      fileName: "ten-khac.pdf",
    });

    expect(second.status).toBe(200);
    expect(UploadDocumentResponse.parse(second.body)).toEqual({
      documentId: UploadDocumentResponse.parse(first.body).documentId,
      status: "uploaded",
      duplicate: true,
    });
    expect(await db.select().from(documents)).toHaveLength(1);
    expect(await storedKeys()).toHaveLength(1);
    expect(await readdir(tmpDir)).toEqual([]);
  });

  it("staff khác upload trùng file → 409, không thêm dòng, không thêm file", async () => {
    const content = samplePdf("shared");
    await uploadFile(app, staffA, content);

    const res = await uploadFile(app, staffB, content);

    expect(res.status).toBe(409);
    expect(ApiError.parse(res.body).code).toBe("CONFLICT");
    expect(await db.select().from(documents)).toHaveLength(1);
    expect(await storedKeys()).toHaveLength(1);
    expect(await readdir(tmpDir)).toEqual([]);
  });

  it("hai request cùng file chạy song song → một dòng, cả hai cùng documentId", async () => {
    const content = samplePdf("race");

    const results = await Promise.all([
      uploadFile(app, staffA, content),
      uploadFile(app, staffA, content),
    ]);

    expect(results.map((r) => r.status).sort()).toEqual([200, 201]);
    const ids = results.map(
      (r) => UploadDocumentResponse.parse(r.body).documentId,
    );
    expect(ids[0]).toBe(ids[1]);
    expect(await db.select().from(documents)).toHaveLength(1);
    expect(await storedKeys()).toHaveLength(1);
    expect(await readdir(tmpDir)).toEqual([]);
  });

  it("file đúng bằng UPLOAD_MAX_BYTES thì nhận", async () => {
    const res = await uploadFile(
      app,
      staffA,
      samplePdf("max", UPLOAD_MAX_BYTES),
    );

    expect(res.status).toBe(201);
  });

  it("file UPLOAD_MAX_BYTES + 1 → 413 đọc được body, không dòng, tmp rỗng", async () => {
    const res = await uploadFile(
      app,
      staffA,
      samplePdf("big", UPLOAD_MAX_BYTES + 1),
    );

    expect(res.status).toBe(413);
    expect(ApiError.parse(res.body).code).toBe("PAYLOAD_TOO_LARGE");
    expect(await db.select().from(documents)).toHaveLength(0);
    expect(await storedKeys()).toEqual([]);
    expect(await readdir(tmpDir)).toEqual([]);
  });

  it("file text đổi đuôi .pdf → 415, tmp rỗng", async () => {
    const res = await uploadFile(
      app,
      staffA,
      Buffer.from("SAMPLE plain text"),
      {
        fileName: "fake.pdf",
      },
    );

    expect(res.status).toBe(415);
    expect(ApiError.parse(res.body).code).toBe("UNSUPPORTED_MEDIA_TYPE");
    expect(await db.select().from(documents)).toHaveLength(0);
    expect(await readdir(tmpDir)).toEqual([]);
  });

  it("file rỗng → 400", async () => {
    const res = await uploadFile(app, staffA, Buffer.alloc(0));

    expect(res.status).toBe(400);
    expect(await readdir(tmpDir)).toEqual([]);
  });

  it("declaredDocType ngoài DocType → 400 VALIDATION_FAILED, tmp rỗng", async () => {
    const res = await uploadFile(app, staffA, samplePdf("bad-type"), {
      declaredDocType: "passport",
    });

    expect(res.status).toBe(400);
    expect(ApiError.parse(res.body).code).toBe("VALIDATION_FAILED");
    expect(await readdir(tmpDir)).toEqual([]);
  });

  it("field thừa (vd staffId) → 400", async () => {
    const res = await request(app.getHttpServer())
      .post("/documents")
      .set("Cookie", staffA)
      .field("staffId", "01SOMEONEELSE")
      .attach("file", samplePdf("extra"), "cpr.pdf");

    expect(res.status).toBe(400);
    expect(await db.select().from(documents)).toHaveLength(0);
  });

  it("không có file, file sai field, hai file, hay không phải multipart → 400", async () => {
    const server = app.getHttpServer();
    const noFile = await request(server)
      .post("/documents")
      .set("Cookie", staffA)
      .field("declaredDocType", "cpr_card");
    const wrongField = await uploadFile(app, staffA, samplePdf("w"), {
      field: "document",
    });
    const twoFiles = await request(server)
      .post("/documents")
      .set("Cookie", staffA)
      .attach("file", samplePdf("1"), "a.pdf")
      .attach("file", samplePdf("2"), "b.pdf");
    const json = await request(server)
      .post("/documents")
      .set("Cookie", staffA)
      .send({ file: "x" });

    expect([noFile, wrongField, twoFiles, json].map((r) => r.status)).toEqual([
      400, 400, 400, 400,
    ]);
    expect(await db.select().from(documents)).toHaveLength(0);
    expect(await readdir(tmpDir)).toEqual([]);
  });

  it("chưa đăng nhập → 401; reviewer, admin → 403", async () => {
    const reviewer = await loginAs(app, db, "reviewer");
    const admin = await loginAs(app, db, "admin");

    const anonymous = await request(app.getHttpServer())
      .post("/documents")
      .attach("file", samplePdf("anon"), "a.pdf");
    const asReviewer = await uploadFile(app, reviewer, samplePdf("r"));
    const asAdmin = await uploadFile(app, admin, samplePdf("ad"));

    expect(anonymous.status).toBe(401);
    expect(asReviewer.status).toBe(403);
    expect(asAdmin.status).toBe(403);
    expect(await db.select().from(documents)).toHaveLength(0);
  });
});

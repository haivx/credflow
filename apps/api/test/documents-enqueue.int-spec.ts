import type { INestApplication } from "@nestjs/common";
import { Logger } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { UploadDocumentResponse } from "@credflow/contracts";
import { Queue } from "bullmq";
import { Redis } from "ioredis";
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
import { AppModule } from "../src/app.module.js";
import { type Db, DB } from "../src/db/db.provider.js";
import { documents } from "../src/db/schema.js";
import {
  DOCUMENT_QUEUE,
  DOCUMENT_QUEUE_NAME,
} from "../src/queue/document-queue.js";
import { BullDocumentQueue } from "../src/queue/queue.module.js";
import { loginAs } from "./auth.js";
import { truncateAll } from "./db.js";
import { testEnv } from "./test-env.js";
import { resetDataDir, samplePdf, storedKeys, uploadFile } from "./upload.js";

describe("POST /documents đẩy job", () => {
  describe("với queue thật", () => {
    let app: INestApplication;
    let db: Db;
    let staff: string;
    const queue = new Queue(DOCUMENT_QUEUE_NAME, {
      connection: { url: testEnv.REDIS_URL },
    });

    beforeAll(async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();
      app = moduleRef.createNestApplication();
      await app.init();
      db = app.get(DB);
    });

    afterAll(async () => {
      await app.close();
      await queue.close();
    });

    beforeEach(async () => {
      await queue.obliterate({ force: true });
      await truncateAll(db);
      await resetDataDir();
      staff = await loginAs(app, db, "staff");
    });

    it("upload mới: có một job, jobId là documentId, data chỉ có documentId", async () => {
      const res = await uploadFile(app, staff, samplePdf("enqueue-moi"));

      expect(res.status).toBe(201);
      const { documentId } = UploadDocumentResponse.parse(res.body);
      const jobs = await queue.getJobs(["waiting"]);
      expect(jobs).toHaveLength(1);
      expect(jobs[0]?.id).toBe(documentId);
      expect(jobs[0]?.data).toEqual({ documentId });
      expect(jobs[0]?.opts.attempts).toBe(3);
    });

    it("upload trùng: không thêm job", async () => {
      const content = samplePdf("enqueue-trung");
      await uploadFile(app, staff, content);
      await queue.obliterate({ force: true });

      const res = await uploadFile(app, staff, content);

      expect(res.status).toBe(200);
      expect(await queue.getJobs(["waiting"])).toHaveLength(0);
    });
  });

  describe("khi Redis đã chết từ lúc khởi động", () => {
    it("enqueue lỗi trong vài giây thay vì treo, và vẫn đóng được queue", async () => {
      // Cổng không có Redis. Cùng option với redisProvider.
      const redis = new Redis("redis://localhost:6390", {
        enableOfflineQueue: false,
        maxRetriesPerRequest: 1,
        connectTimeout: 1000,
      });
      redis.on("error", () => undefined);
      const queue = new BullDocumentQueue(redis);

      await expect(queue.enqueue("01KHONGCOREDIS")).rejects.toThrow();

      await queue.onModuleDestroy();
      redis.disconnect();
    }, 8_000);
  });

  describe("khi queue.add lỗi", () => {
    let app: INestApplication;
    let db: Db;

    beforeAll(async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [AppModule],
      })
        .overrideProvider(DOCUMENT_QUEUE)
        .useValue({ enqueue: () => Promise.reject(new Error("redis chết")) })
        .compile();
      app = moduleRef.createNestApplication();
      await app.init();
      db = app.get(DB);
    });

    afterAll(async () => {
      await app.close();
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("vẫn 201, dòng uploaded và file còn nguyên, có log lỗi", async () => {
      await truncateAll(db);
      await resetDataDir();
      const staff = await loginAs(app, db, "staff");
      const logError = vi.spyOn(Logger.prototype, "error");

      const res = await uploadFile(app, staff, samplePdf("enqueue-loi"));

      expect(res.status).toBe(201);
      const body = UploadDocumentResponse.parse(res.body);
      expect(body.status).toBe("uploaded");
      const rows = await db.select().from(documents);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.id).toBe(body.documentId);
      expect(rows[0]?.status).toBe("uploaded");
      expect(await storedKeys()).toEqual([rows[0]?.storageKey]);
      expect(JSON.stringify(logError.mock.calls)).toContain(body.documentId);
    });
  });
});

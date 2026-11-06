import { Logger } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { Queue } from "bullmq";
import { eq } from "drizzle-orm";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  type MockInstance,
  vi,
} from "vitest";
import { route } from "@credflow/rules";
import { AppModule } from "../src/app.module.js";
import { documents, staff } from "../src/db/schema.js";
import {
  DocumentStatusConflictError,
  DocumentStatusService,
} from "../src/documents/document-status.service.js";
import {
  PIPELINE,
  type Pipeline,
  type PipelineResult,
} from "../src/pipeline/pipeline.js";
import {
  DOCUMENT_JOB_OPTIONS,
  DOCUMENT_QUEUE,
  DOCUMENT_QUEUE_NAME,
  PROCESS_DOCUMENT_JOB,
  SWEEP_QUEUE_NAME,
  SWEEP_SCHEDULER_ID,
} from "../src/queue/document-queue.js";
import { BullDocumentQueue } from "../src/queue/queue.module.js";
import {
  DocumentSweepService,
  PROCESSING_STALE_MS,
} from "../src/worker/document-sweep.service.js";
import { WorkerModule } from "../src/worker.module.js";
import { loginAs } from "./auth.js";
import {
  createTestDb,
  makeDocument,
  makeProcessedDocument,
  makeStaff,
  truncateAll,
} from "./db.js";
import { testEnv } from "./test-env.js";
import { resetDataDir, samplePdf, uploadFile } from "./upload.js";

const SECRET = "SAMPLE-gia-tri-khong-duoc-luu";
const OK: PipelineResult = {
  status: "needs_review",
  routing: route([]),
  ruleResults: [],
};

/** Mốc "bây giờ" đủ xa để mọi document đều quá hạn, khỏi phải sửa `updatedAt`. */
const later = () => new Date(Date.now() + 2 * PROCESSING_STALE_MS);

/**
 * Worker BullMQ thật trên Redis và Postgres thật; chỉ pipeline là giả. Test gọi `sweepOnce` trực tiếp;
 * `run` (điểm vào của lịch) bị chặn để vòng sweep tự động không đua với test.
 */
describe("sweep", () => {
  const { db, close } = createTestDb();
  const connection = { url: testEnv.REDIS_URL };
  let queue: Queue;
  let sweepQueue: Queue;
  let worker: TestingModule;
  let run: ReturnType<typeof vi.fn<Pipeline["run"]>>;
  let scheduledRun: MockInstance<DocumentSweepService["run"]>;
  let staffId: string;

  const startWorker = async () => {
    worker = await Test.createTestingModule({ imports: [WorkerModule] })
      .overrideProvider(PIPELINE)
      .useValue({ run })
      .compile();
    await worker.init();
  };

  const sweep = () => worker.get(DocumentSweepService);

  const readDocument = async (id: string) => {
    const [row] = await db.select().from(documents).where(eq(documents.id, id));
    if (row === undefined) throw new Error(`không có document ${id}`);
    return row;
  };

  const waitForJob = async (
    id: string,
    state: "active" | "completed" | "failed",
  ) => {
    await vi.waitFor(
      async () => {
        expect(await queue.getJobState(id)).toBe(state);
      },
      { timeout: 10_000, interval: 50 },
    );
  };

  const addJob = (jobId: string, documentId = jobId) =>
    queue.add(
      PROCESS_DOCUMENT_JOB,
      { documentId },
      { ...DOCUMENT_JOB_OPTIONS, jobId },
    );

  /** Tạo job failed thật còn giữ trong Redis: job chạy khi chưa có dòng DB nên lỗi không retry. */
  const leaveFailedJob = async (id: string) => {
    await addJob(id);
    await waitForJob(id, "failed");
  };

  /** Tạo job completed thật còn giữ: job gặp document đã xong thì bỏ qua, rồi xoá dòng đó đi. */
  const leaveCompletedJob = async (id: string) => {
    await db
      .insert(documents)
      .values(makeProcessedDocument(staffId, "needs_review", { id }));
    await addJob(id);
    await waitForJob(id, "completed");
    await db.delete(documents).where(eq(documents.id, id));
  };

  beforeAll(() => {
    queue = new Queue(DOCUMENT_QUEUE_NAME, { connection });
    sweepQueue = new Queue(SWEEP_QUEUE_NAME, { connection });
  });

  afterAll(async () => {
    await queue.close();
    await sweepQueue.close();
    await close();
  });

  beforeEach(async () => {
    await queue.obliterate({ force: true });
    await sweepQueue.obliterate({ force: true });
    await truncateAll(db);
    const row = makeStaff();
    await db.insert(staff).values(row);
    staffId = row.id;
    run = vi.fn<Pipeline["run"]>().mockResolvedValue(OK);
    scheduledRun = vi
      .spyOn(DocumentSweepService.prototype, "run")
      .mockResolvedValue();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await worker.close();
  });

  it("queue.add lỗi lúc upload: sweep đưa document tới needs_review", async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DOCUMENT_QUEUE)
      .useValue({ enqueue: () => Promise.reject(new Error("redis chết")) })
      .compile();
    const app = moduleRef.createNestApplication();
    await app.init();
    await resetDataDir();
    let documentId: string;
    try {
      await truncateAll(db);
      const cookie = await loginAs(app, db, "staff");
      const res = await uploadFile(app, cookie, samplePdf("sweep-cuu"));
      expect(res.status).toBe(201);
      const [row] = await db.select().from(documents);
      if (row === undefined) throw new Error("upload không tạo dòng");
      expect(row.status).toBe("uploaded");
      documentId = row.id;
    } finally {
      await app.close();
    }
    await startWorker();

    await sweep().sweepOnce(later());
    await waitForJob(documentId, "completed");

    expect(run).toHaveBeenCalledTimes(1);
    expect((await readDocument(documentId)).status).toBe("needs_review");
  });

  it("uploaded, job failed còn giữ: xoá job cũ rồi chạy lại", async () => {
    await startWorker();
    const doc = makeDocument(staffId);
    await leaveFailedJob(doc.id);
    await db.insert(documents).values(doc);

    await sweep().sweepOnce(later());
    await waitForJob(doc.id, "completed");

    expect(run).toHaveBeenCalledTimes(1);
    expect((await readDocument(doc.id)).status).toBe("needs_review");
  });

  it("uploaded, job completed còn giữ: xoá job cũ rồi chạy lại", async () => {
    await startWorker();
    const doc = makeDocument(staffId);
    await leaveCompletedJob(doc.id);
    await db.insert(documents).values(doc);

    await sweep().sweepOnce(later());
    await vi.waitFor(
      async () => {
        expect((await readDocument(doc.id)).status).toBe("needs_review");
      },
      { timeout: 10_000, interval: 50 },
    );

    expect(run).toHaveBeenCalledTimes(1);
  });

  it("processing quá hạn, không có job: sang needs_review, pipeline không chạy", async () => {
    await startWorker();
    const doc = makeProcessedDocument(staffId, "processing");
    await db.insert(documents).values(doc);
    const before = await readDocument(doc.id);

    await sweep().sweepOnce(later());

    expect(run).not.toHaveBeenCalled();
    const row = await readDocument(doc.id);
    expect(row.status).toBe("needs_review");
    expect(row.routing).toEqual({
      decision: "needs_review",
      reasons: ["NO_RULES_EVALUATED"],
    });
    expect(row.error).toEqual({
      step: "sweep",
      message: "Xử lý bị gián đoạn",
    });
    expect(row.versions).toEqual(before.versions);
  });

  it("processing quá hạn, job failed còn giữ: sang needs_review, pipeline không chạy", async () => {
    await startWorker();
    const doc = makeProcessedDocument(staffId, "processing");
    await leaveFailedJob(doc.id);
    await db.insert(documents).values(doc);

    await sweep().sweepOnce(later());

    expect(run).not.toHaveBeenCalled();
    const row = await readDocument(doc.id);
    expect(row.status).toBe("needs_review");
    expect(row.error?.step).toBe("sweep");
  });

  it("extracted quá hạn, không có job: sang needs_review, giữ extraction, pipeline không chạy", async () => {
    await startWorker();
    const doc = makeProcessedDocument(staffId, "extracted");
    await db.insert(documents).values(doc);
    const before = await readDocument(doc.id);

    await sweep().sweepOnce(later());

    expect(run).not.toHaveBeenCalled();
    const row = await readDocument(doc.id);
    expect(row.status).toBe("needs_review");
    expect(row.routing).toEqual({
      decision: "needs_review",
      reasons: ["NO_RULES_EVALUATED"],
    });
    expect(row.error).toEqual({
      step: "sweep",
      message: "Xử lý bị gián đoạn",
    });
    expect(row.extraction).toEqual(before.extraction);
  });

  it("extracted chưa quá hạn: không đụng tới", async () => {
    await startWorker();
    const doc = makeProcessedDocument(staffId, "extracted");
    await db.insert(documents).values(doc);

    await sweep().sweepOnce(new Date());

    expect((await readDocument(doc.id)).status).toBe("extracted");
  });

  it("processing quá hạn, job đang chạy: không đụng tới, job xong thì ra kết quả", async () => {
    let release: (result: PipelineResult) => void = () => undefined;
    run.mockImplementation(
      () =>
        new Promise<PipelineResult>((resolve) => {
          release = resolve;
        }),
    );
    await startWorker();
    const doc = makeDocument(staffId);
    await db.insert(documents).values(doc);
    await addJob(doc.id);
    await vi.waitFor(() => {
      expect(run).toHaveBeenCalledTimes(1);
    });
    const before = await readDocument(doc.id);

    await sweep().sweepOnce(later());

    expect(await readDocument(doc.id)).toEqual(before);
    expect(before.status).toBe("processing");

    release(OK);
    await waitForJob(doc.id, "completed");
    const row = await readDocument(doc.id);
    expect(row.status).toBe("needs_review");
    expect(row.error).toBeNull();
  });

  it("chưa quá hạn, hoặc đã xong: không đụng tới, không có job mới", async () => {
    await startWorker();
    const fresh = makeDocument(staffId);
    const freshProcessing = makeProcessedDocument(staffId, "processing");
    const done = makeProcessedDocument(staffId, "needs_review");
    await db.insert(documents).values([fresh, freshProcessing]);

    await sweep().sweepOnce(new Date());

    expect((await readDocument(fresh.id)).status).toBe("uploaded");
    expect((await readDocument(freshProcessing.id)).status).toBe("processing");

    await db.delete(documents).where(eq(documents.id, fresh.id));
    await db.delete(documents).where(eq(documents.id, freshProcessing.id));
    await db.insert(documents).values(done);
    const before = await readDocument(done.id);

    await sweep().sweepOnce(later());

    expect(await readDocument(done.id)).toEqual(before);
    expect(await queue.getJobState(fresh.id)).toBe("unknown");
    expect(await queue.getJobState(done.id)).toBe("unknown");
  });

  it("một document lỗi giữa vòng: document sau vẫn được xử lý, vòng sau cứu nốt", async () => {
    await startWorker();
    const first = makeDocument(staffId, {
      updatedAt: new Date("2026-01-01T00:00:00Z"),
    });
    const second = makeDocument(staffId, {
      updatedAt: new Date("2026-01-02T00:00:00Z"),
    });
    await db.insert(documents).values([first, second]);
    const logError = vi.spyOn(Logger.prototype, "error");
    vi.spyOn(BullDocumentQueue.prototype, "requeue").mockRejectedValueOnce(
      new Error("redis chết"),
    );

    await sweep().sweepOnce(later());
    await waitForJob(second.id, "completed");

    expect((await readDocument(second.id)).status).toBe("needs_review");
    expect((await readDocument(first.id)).status).toBe("uploaded");
    expect(JSON.stringify(logError.mock.calls)).toContain(first.id);

    await sweep().sweepOnce(later());
    await waitForJob(first.id, "completed");
    expect((await readDocument(first.id)).status).toBe("needs_review");
  });

  it("worker ghi xong đúng lúc sweep chuyển: conflict không phải lỗi", async () => {
    await startWorker();
    const doc = makeProcessedDocument(staffId, "processing");
    await db.insert(documents).values(doc);
    const logError = vi.spyOn(Logger.prototype, "error");
    vi.spyOn(
      DocumentStatusService.prototype,
      "transition",
    ).mockRejectedValueOnce(
      new DocumentStatusConflictError(doc.id, "processing", "needs_review"),
    );

    await sweep().sweepOnce(later());

    expect(logError).not.toHaveBeenCalled();
  });

  it("run: lỗi đem lưu Redis không chứa message gốc", async () => {
    await startWorker();
    scheduledRun.mockRestore();
    vi.spyOn(DocumentSweepService.prototype, "sweepOnce").mockRejectedValueOnce(
      new Error(SECRET),
    );

    await expect(sweep().run()).rejects.toThrow("Sweep lỗi, xem log worker");
  });

  it("worker khởi động: đăng ký lịch và job định kỳ thật sự gọi sweep", async () => {
    await startWorker();

    await vi.waitFor(
      async () => {
        expect(
          await sweepQueue.getJobScheduler(SWEEP_SCHEDULER_ID),
        ).toBeDefined();
        expect(scheduledRun).toHaveBeenCalled();
      },
      { timeout: 10_000, interval: 50 },
    );
  });
});

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
  vi,
} from "vitest";
import { route } from "@credflow/rules";
import { documents, staff } from "../src/db/schema.js";
import {
  DocumentStatusConflictError,
  DocumentStatusService,
} from "../src/documents/document-status.service.js";
import {
  PIPELINE,
  type Pipeline,
  type PipelineResult,
  UnreadableFileError,
} from "../src/pipeline/pipeline.js";
import {
  DOCUMENT_JOB_OPTIONS,
  DOCUMENT_QUEUE_NAME,
  PROCESS_DOCUMENT_JOB,
} from "../src/queue/document-queue.js";
import { WorkerModule } from "../src/worker.module.js";
import {
  createTestDb,
  makeDocument,
  makeProcessedDocument,
  makeStaff,
  truncateAll,
} from "./db.js";
import { testEnv } from "./test-env.js";

const SECRET = "SAMPLE-gia-tri-khong-duoc-luu";
const OK: PipelineResult = {
  status: "needs_review",
  routing: route([]),
  ruleResults: [],
};

/** Worker BullMQ thật trên Redis và Postgres thật; chỉ pipeline là giả. */
describe("worker xử lý document", () => {
  const { db, close } = createTestDb();
  const connection = { url: testEnv.REDIS_URL };
  let queue: Queue;
  let worker: TestingModule;
  let run: ReturnType<typeof vi.fn<Pipeline["run"]>>;
  let staffId: string;

  const startWorker = async () => {
    worker = await Test.createTestingModule({ imports: [WorkerModule] })
      .overrideProvider(PIPELINE)
      .useValue({ run })
      .compile();
    await worker.init();
  };

  const addDocument = async () => {
    const doc = makeDocument(staffId);
    await db.insert(documents).values(doc);
    await queue.add(
      PROCESS_DOCUMENT_JOB,
      { documentId: doc.id },
      { ...DOCUMENT_JOB_OPTIONS, jobId: doc.id },
    );
    return doc.id;
  };

  const readDocument = async (id: string) => {
    const [row] = await db.select().from(documents).where(eq(documents.id, id));
    if (row === undefined) throw new Error(`không có document ${id}`);
    return row;
  };

  /** Chờ tới khi job vào trạng thái `state` trong BullMQ. */
  const waitForJob = async (id: string, state: "completed" | "failed") => {
    await vi.waitFor(
      async () => {
        expect(await queue.getJobState(id)).toBe(state);
      },
      { timeout: 10_000, interval: 50 },
    );
  };

  beforeAll(() => {
    queue = new Queue(DOCUMENT_QUEUE_NAME, { connection });
  });

  afterAll(async () => {
    await queue.close();
    await close();
  });

  beforeEach(async () => {
    await queue.obliterate({ force: true });
    await truncateAll(db);
    const row = makeStaff();
    await db.insert(staff).values(row);
    staffId = row.id;
    run = vi.fn<Pipeline["run"]>().mockResolvedValue(OK);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await worker.close();
  });

  it("luồng chuẩn: uploaded → needs_review, có versions, lý do NO_RULES_EVALUATED", async () => {
    await startWorker();
    const id = await addDocument();

    await waitForJob(id, "completed");

    expect(run).toHaveBeenCalledTimes(1);
    const row = await readDocument(id);
    expect(row.status).toBe("needs_review");
    expect(row.routing).toEqual({
      decision: "needs_review",
      reasons: ["NO_RULES_EVALUATED"],
    });
    expect(row.versions).toEqual({
      pipeline: "21",
      prompt: "classify@1+extract-cpr@1",
      model: "claude-haiku-5-5",
      rules: "1",
    });
    expect(row.error).toBeNull();
  });

  it("lỗi tạm rồi hồi phục: chạy 3 lần, không còn error, Redis không giữ message gốc", async () => {
    run
      .mockRejectedValueOnce(new Error(SECRET))
      .mockRejectedValueOnce(new Error(SECRET));
    await startWorker();
    const id = await addDocument();

    await waitForJob(id, "completed");

    expect(run).toHaveBeenCalledTimes(3);
    const row = await readDocument(id);
    expect(row.status).toBe("needs_review");
    expect(row.error).toBeNull();

    const job = await queue.getJob(id);
    expect(job?.stacktrace?.length).toBeGreaterThan(0);
    expect(JSON.stringify(job?.stacktrace)).not.toContain(SECRET);
  }, 15_000);

  it("hết retry: chạy đúng 3 lần, sang needs_review, error không chép lỗi gốc", async () => {
    run.mockRejectedValue(new Error(SECRET));
    await startWorker();
    const id = await addDocument();

    await waitForJob(id, "completed");

    expect(run).toHaveBeenCalledTimes(3);
    const row = await readDocument(id);
    expect(row.status).toBe("needs_review");
    expect(row.routing).toEqual({
      decision: "needs_review",
      reasons: ["NO_RULES_EVALUATED"],
    });
    expect(row.error?.step).toBe("pipeline");
    expect(JSON.stringify(row.error)).not.toContain(SECRET);
  }, 15_000);

  it("file hỏng: chạy 1 lần, sang failed, không retry", async () => {
    run.mockRejectedValue(new UnreadableFileError());
    await startWorker();
    const id = await addDocument();

    await waitForJob(id, "failed");

    expect(run).toHaveBeenCalledTimes(1);
    const row = await readDocument(id);
    expect(row.status).toBe("failed");
    expect(row.error?.step).toBe("pipeline");
  });

  it("job data sai schema: vào failed set, không retry, không log giá trị", async () => {
    const logError = vi.spyOn(Logger.prototype, "error");
    await startWorker();

    await queue.add(
      PROCESS_DOCUMENT_JOB,
      { documentId: 123, note: SECRET },
      { ...DOCUMENT_JOB_OPTIONS, jobId: "job-sai" },
    );
    await waitForJob("job-sai", "failed");

    expect(run).not.toHaveBeenCalled();
    const job = await queue.getJob("job-sai");
    expect(job?.attemptsMade).toBe(1);
    // Phân biệt với "không có document": không parse thì 123 vẫn đi tới query và cũng fail.
    expect(job?.failedReason).toBe("Dữ liệu job sai schema");
    expect(JSON.stringify(logError.mock.calls)).not.toContain(SECRET);
    expect(logError).toHaveBeenCalled();
  });

  it("job chạy lại trên document đã xong: pipeline không chạy, dòng không đổi", async () => {
    const doc = makeProcessedDocument(staffId, "needs_review");
    await db.insert(documents).values(doc);
    const before = await readDocument(doc.id);
    await startWorker();

    await queue.add(
      PROCESS_DOCUMENT_JOB,
      { documentId: doc.id },
      { ...DOCUMENT_JOB_OPTIONS, jobId: "job-chay-lai" },
    );
    await waitForJob("job-chay-lai", "completed");

    expect(run).not.toHaveBeenCalled();
    expect(await readDocument(doc.id)).toEqual(before);
  });

  it("hai job song song cùng document: một kết quả, job thua không lỗi, không retry", async () => {
    const releases: (() => void)[] = [];
    run.mockImplementation(
      () =>
        new Promise<PipelineResult>((resolve) => {
          releases.push(() => {
            resolve(OK);
          });
        }),
    );
    const transition = vi.spyOn(DocumentStatusService.prototype, "transition");
    const logError = vi.spyOn(Logger.prototype, "error");
    await startWorker();
    const id = await addDocument();
    await vi.waitFor(() => {
      expect(run).toHaveBeenCalledTimes(1);
    });

    await queue.add(
      PROCESS_DOCUMENT_JOB,
      { documentId: id },
      { ...DOCUMENT_JOB_OPTIONS, jobId: "job-trung" },
    );
    await vi.waitFor(() => {
      expect(run).toHaveBeenCalledTimes(2);
    });
    for (const release of releases) release();

    await waitForJob(id, "completed");
    await waitForJob("job-trung", "completed");

    expect(run).toHaveBeenCalledTimes(2);
    const row = await readDocument(id);
    expect(row.status).toBe("needs_review");
    expect(row.error).toBeNull();
    expect((await queue.getJob(id))?.attemptsMade).toBe(1);
    expect((await queue.getJob("job-trung"))?.attemptsMade).toBe(1);
    // uploaded → processing, rồi 2 lần ghi kết quả (một thắng, một conflict).
    expect(transition).toHaveBeenCalledTimes(3);
    expect(logError).not.toHaveBeenCalled();
  });

  it("transition với from đã cũ: lỗi conflict, dòng không đổi", async () => {
    await startWorker();
    const doc = makeProcessedDocument(staffId, "needs_review");
    await db.insert(documents).values(doc);
    const before = await readDocument(doc.id);

    await expect(
      worker
        .get(DocumentStatusService)
        .transition(doc.id, "processing", "failed", {
          error: { step: "pipeline", message: "x" },
        }),
    ).rejects.toBeInstanceOf(DocumentStatusConflictError);

    expect(await readDocument(doc.id)).toEqual(before);
  });
});

import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Logger } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import Anthropic from "@anthropic-ai/sdk";
import { CprCardFields } from "@credflow/contracts";
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
import type * as z from "zod";
import { documents, staff } from "../src/db/schema.js";
import { LLM_CLIENT } from "../src/llm/llm.service.js";
import {
  DOCUMENT_JOB_OPTIONS,
  DOCUMENT_QUEUE_NAME,
  PROCESS_DOCUMENT_JOB,
} from "../src/queue/document-queue.js";
import { DocumentSweepService } from "../src/worker/document-sweep.service.js";
import { WorkerModule } from "../src/worker.module.js";
import { createTestDb, makeDocument, makeStaff, truncateAll } from "./db.js";
import { testEnv } from "./test-env.js";
import { filesDir, samplePng } from "./upload.js";

const SECRET = "SAMPLE-gia-tri-khong-duoc-luu";
const HOLDER = "SAMPLE Holder Name";

const CPR_FIELD = (value: string | null) =>
  value === null
    ? { value: null, confidence: 0, evidence: null }
    : {
        value,
        confidence: 0.9,
        evidence: {
          quote: value,
          box: { page: 0, x: 0.1, y: 0.1, w: 0.1, h: 0.1 },
        },
      };

const CPR: z.output<typeof CprCardFields> = {
  holderName: CPR_FIELD(HOLDER),
  issuerName: CPR_FIELD("Northbridge Safety Council"),
  courseType: CPR_FIELD("Adult CPR"),
  completionDate: CPR_FIELD("2026-03-14"),
  expirationDate: CPR_FIELD("2028-03-14"),
  validityText: CPR_FIELD(null),
  cardNumber: CPR_FIELD(null),
};

/** Response giống API: có block thinking đứng trước, để bắt code đọc theo vị trí. */
const reply = (body: unknown, stop_reason = "end_turn") => ({
  content: [
    { type: "thinking", thinking: "", signature: "x" },
    { type: "text", text: JSON.stringify(body) },
  ],
  stop_reason,
  usage: { input_tokens: 10, output_tokens: 5 },
});
const IS_CPR = reply({ docType: "cpr_card", confidence: 0.97 });
const IS_TB = reply({ docType: "tb_test", confidence: 0.97 });
const FIELDS = reply(CPR);

const http = (status: number) =>
  Anthropic.APIError.generate(
    status,
    { type: "error", error: { message: SECRET } },
    SECRET,
    new Headers(),
  );

/** Worker BullMQ thật, Redis, Postgres, file thật; chỉ client LLM là giả, lỗi là lỗi thật của SDK. */
describe("pipeline LLM", () => {
  const { db, close } = createTestDb();
  const connection = { url: testEnv.REDIS_URL };
  let queue: Queue;
  let worker: TestingModule;
  let create: ReturnType<typeof vi.fn<(params: unknown) => Promise<unknown>>>;
  let staffId: string;

  const startWorker = async () => {
    worker = await Test.createTestingModule({ imports: [WorkerModule] })
      .overrideProvider(LLM_CLIENT)
      .useValue({ messages: { create } })
      .compile();
    await worker.init();
  };

  /** Dòng DB + file thật + job, như sau một lần upload. */
  const addDocument = async (withFile = true) => {
    const doc = makeDocument(staffId);
    if (withFile) {
      const path = join(filesDir, doc.storageKey);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, samplePng(doc.id));
    }
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

  const waitForJob = async (id: string, state: "completed" | "failed") => {
    await vi.waitFor(
      async () => {
        expect(await queue.getJobState(id)).toBe(state);
      },
      { timeout: 15_000, interval: 50 },
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
    await rm(filesDir, { recursive: true, force: true });
    const row = makeStaff();
    await db.insert(staff).values(row);
    staffId = row.id;
    create = vi.fn<(params: unknown) => Promise<unknown>>();
    vi.spyOn(DocumentSweepService.prototype, "run").mockResolvedValue();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await worker.close();
  });

  it("thẻ CPR: lưu classification, extraction, versions, timingMs; bỏ box; vẫn chuyển người duyệt", async () => {
    create.mockResolvedValueOnce(IS_CPR).mockResolvedValueOnce(FIELDS);
    await startWorker();

    const id = await addDocument();
    await waitForJob(id, "completed");

    expect(create).toHaveBeenCalledTimes(2);
    const row = await readDocument(id);
    expect(row.status).toBe("needs_review");
    expect(row.routing).toEqual({
      decision: "needs_review",
      reasons: ["NO_RULES_EVALUATED"],
    });
    expect(row.classification).toEqual({
      docType: "cpr_card",
      confidence: 0.97,
    });
    expect(row.extraction?.docType).toBe("cpr_card");
    if (row.extraction?.docType !== "cpr_card") throw new Error("sai loại");
    expect(row.extraction.fields.holderName.value).toBe(HOLDER);
    expect(row.extraction.fields.holderName.evidence).toEqual({
      quote: HOLDER,
    });
    expect(row.extraction.fields.validityText.value).toBeNull();
    expect(row.versions?.model).toBe("claude-haiku-5-5");
    expect(Object.keys(row.timingMs).sort()).toEqual(["classify", "extract"]);
    expect(row.error).toBeNull();
  });

  it("giấy không phải CPR: chỉ phân loại, không trích xuất", async () => {
    create.mockResolvedValueOnce(IS_TB);
    await startWorker();

    const id = await addDocument();
    await waitForJob(id, "completed");

    expect(create).toHaveBeenCalledTimes(1);
    const row = await readDocument(id);
    expect(row.status).toBe("needs_review");
    expect(row.classification?.docType).toBe("tb_test");
    expect(row.extraction).toBeNull();
  });

  it.each([
    ["429", () => http(429)],
    ["500", () => http(500)],
    [
      "timeout",
      () => new Anthropic.APIConnectionTimeoutError({ message: SECRET }),
    ],
  ])(
    "%s rồi hồi phục: BullMQ chạy lại, không còn error",
    async (_, makeErr) => {
      create
        .mockRejectedValueOnce(makeErr())
        .mockResolvedValueOnce(IS_CPR)
        .mockResolvedValueOnce(FIELDS);
      await startWorker();

      const id = await addDocument();
      await waitForJob(id, "completed");

      expect(create).toHaveBeenCalledTimes(3);
      const row = await readDocument(id);
      expect(row.extraction).not.toBeNull();
      expect(row.error).toBeNull();
    },
    20_000,
  );

  it("5xx liên tục: đúng 3 lượt, chuyển người duyệt, không chép lỗi gốc", async () => {
    create.mockImplementation(() => Promise.reject(http(503)));
    const logged = [
      vi.spyOn(Logger.prototype, "error"),
      vi.spyOn(Logger.prototype, "warn"),
      vi.spyOn(Logger.prototype, "log"),
    ];
    await startWorker();

    const id = await addDocument();
    await waitForJob(id, "completed");

    expect(create).toHaveBeenCalledTimes(3);
    const row = await readDocument(id);
    expect(row.status).toBe("needs_review");
    expect(row.error?.step).toBe("pipeline");
    expect(JSON.stringify(row.error)).not.toContain(SECRET);
    const job = await queue.getJob(id);
    expect(job?.stacktrace?.length).toBeGreaterThan(0);
    expect(JSON.stringify(job?.stacktrace)).not.toContain(SECRET);
    expect(JSON.stringify(logged.map((s) => s.mock.calls))).not.toContain(
      SECRET,
    );
  }, 20_000);

  it.each([[400], [401], [403], [404]])(
    "%i: một lượt, không retry, chuyển người duyệt",
    async (status) => {
      create.mockImplementation(() => Promise.reject(http(status)));
      await startWorker();

      const id = await addDocument();
      await waitForJob(id, "completed");

      expect(create).toHaveBeenCalledTimes(1);
      const row = await readDocument(id);
      expect(row.status).toBe("needs_review");
      expect(row.error?.step).toBe("classify");
      expect(JSON.stringify(row.error)).not.toContain(SECRET);
      expect((await queue.getJob(id))?.attemptsMade).toBe(1);
    },
  );

  it("model từ chối ở bước trích xuất: không retry, giữ classification", async () => {
    create
      .mockResolvedValueOnce(IS_CPR)
      .mockResolvedValueOnce(reply({}, "refusal"));
    await startWorker();

    const id = await addDocument();
    await waitForJob(id, "completed");

    expect(create).toHaveBeenCalledTimes(2);
    const row = await readDocument(id);
    expect(row.status).toBe("needs_review");
    expect(row.error?.step).toBe("extract");
    expect(row.classification?.docType).toBe("cpr_card");
    expect(row.extraction).toBeNull();
  });

  it.each([
    ["sai schema", reply({ docType: "khong-co-loai-nay", confidence: 2 })],
    // JSON hợp lệ nhưng bị cắt: phải coi là hỏng dù parse được.
    [
      "bị cắt max_tokens",
      reply({ docType: "tb_test", confidence: 0.5 }, "max_tokens"),
    ],
    [
      "không phải JSON",
      {
        content: [{ type: "text", text: `lời ${SECRET}` }],
        stop_reason: "end_turn",
        usage: { input_tokens: 1, output_tokens: 1 },
      },
    ],
  ])("output %s lần đầu: gọi lại 1 lần rồi thành công", async (_, bad) => {
    create
      .mockResolvedValueOnce(bad)
      .mockResolvedValueOnce(IS_CPR)
      .mockResolvedValueOnce(FIELDS);
    await startWorker();

    const id = await addDocument();
    await waitForJob(id, "completed");

    expect(create).toHaveBeenCalledTimes(3);
    const row = await readDocument(id);
    expect(row.extraction).not.toBeNull();
    expect(row.error).toBeNull();
    expect((await queue.getJob(id))?.attemptsMade).toBe(1);
  });

  it("output hỏng cả hai lần: dừng ở 2 lượt, chuyển người duyệt", async () => {
    create.mockResolvedValue(reply({}, "max_tokens"));
    await startWorker();

    const id = await addDocument();
    await waitForJob(id, "completed");

    expect(create).toHaveBeenCalledTimes(2);
    const row = await readDocument(id);
    expect(row.status).toBe("needs_review");
    expect(row.error?.step).toBe("classify");
    expect((await queue.getJob(id))?.attemptsMade).toBe(1);
  });

  it("file không còn trong storage: failed, không gọi LLM", async () => {
    await startWorker();

    const id = await addDocument(false);
    await waitForJob(id, "failed");

    expect(create).not.toHaveBeenCalled();
    const row = await readDocument(id);
    expect(row.status).toBe("failed");
    expect(row.error?.step).toBe("pipeline");
  });

  it("LLM lỗi 50%: 20 document đều rời processing", async () => {
    let calls = 0;
    create.mockImplementation((params) => {
      calls += 1;
      if (calls % 2 === 0) return Promise.reject(http(500));
      const isClassify = (params as { max_tokens: number }).max_tokens === 1024;
      return Promise.resolve(isClassify ? IS_CPR : FIELDS);
    });
    await startWorker();

    const ids = await Promise.all(
      Array.from({ length: 20 }, () => addDocument()),
    );
    await Promise.all(ids.map((id) => waitForJob(id, "completed")));

    const rows = await Promise.all(ids.map(readDocument));
    expect(rows.map((r) => r.status)).toEqual(ids.map(() => "needs_review"));
  }, 30_000);
});

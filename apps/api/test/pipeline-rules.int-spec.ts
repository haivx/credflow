import { readFileSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Test, type TestingModule } from "@nestjs/testing";
import { Extraction, parseJson } from "@credflow/contracts";
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
import { CLOCK, type Clock } from "../src/common/clock.js";
import { documents, staff } from "../src/db/schema.js";
import { LLM_CLIENT } from "../src/llm/llm.service.js";
import {
  DOCUMENT_JOB_OPTIONS,
  DOCUMENT_QUEUE_NAME,
  PROCESS_DOCUMENT_JOB,
} from "../src/queue/document-queue.js";
import { RuleStep } from "../src/rules/rule-step.js";
import { DocumentSweepService } from "../src/worker/document-sweep.service.js";
import { WorkerModule } from "../src/worker.module.js";
import { createTestDb, makeDocument, makeStaff, truncateAll } from "./db.js";
import { testEnv } from "./test-env.js";
import { filesDir, samplePng } from "./upload.js";

const AS_OF = "2026-11-06";
const SECRET = "SAMPLE-gia-tri-khong-duoc-luu";
const RECORDED = join(
  import.meta.dirname,
  "..",
  "..",
  "..",
  "eval",
  "hard-cases",
  "cpr",
  "recorded",
);

/** Output thật của Haiku đã ghi (plan 14, 16), trả lại qua client LLM giả. */
function recordedFields(fixture: string) {
  const extraction = parseJson(
    Extraction,
    readFileSync(join(RECORDED, `${fixture}.json`), "utf8"),
  );
  if (extraction.docType !== "cpr_card") throw new Error("không phải CPR");
  return extraction.fields;
}

const reply = (body: unknown) => ({
  content: [{ type: "text", text: JSON.stringify(body) }],
  stop_reason: "end_turn",
  usage: { input_tokens: 10, output_tokens: 5 },
});
const IS_CPR = reply({ docType: "cpr_card", confidence: 0.97 });
const IS_TB = reply({ docType: "tb_test", confidence: 0.97 });

/** Worker BullMQ thật, Postgres, Redis, rule engine và config thật; chỉ client LLM và đồng hồ là giả. */
describe("pipeline nối rule và routing", () => {
  const { db, close } = createTestDb();
  const connection = { url: testEnv.REDIS_URL };
  const clock: Clock = { todayUtc: () => AS_OF };
  let queue: Queue;
  let worker: TestingModule;
  let create: ReturnType<typeof vi.fn<(params: unknown) => Promise<unknown>>>;

  const startWorker = async () => {
    worker = await Test.createTestingModule({ imports: [WorkerModule] })
      .overrideProvider(LLM_CLIENT)
      .useValue({ messages: { create } })
      .overrideProvider(CLOCK)
      .useValue(clock)
      .compile();
    await worker.init();
  };

  const addStaff = async (legalName: string) => {
    const row = makeStaff({ legalName });
    await db.insert(staff).values(row);
    return row.id;
  };

  const addDocument = async (staffId: string) => {
    const doc = makeDocument(staffId);
    const path = join(filesDir, doc.storageKey);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, samplePng(doc.id));
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

  const waitForJob = async (id: string) => {
    await vi.waitFor(
      async () => {
        expect(await queue.getJobState(id)).toBe("completed");
      },
      { timeout: 15_000, interval: 50 },
    );
  };

  /** Một thẻ CPR đi trọn từ job tới kết quả. */
  const runCpr = async (fixture: string, legalName: string) => {
    create
      .mockResolvedValueOnce(IS_CPR)
      .mockResolvedValueOnce(reply(recordedFields(fixture)));
    const id = await addDocument(await addStaff(legalName));
    await waitForJob(id);
    return readDocument(id);
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
    create = vi.fn<(params: unknown) => Promise<unknown>>();
    vi.spyOn(DocumentSweepService.prototype, "run").mockResolvedValue();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await worker.close();
  });

  it("thẻ tốt, đúng người: auto_approved, lưu asOf, ruleResults, timingMs.rules", async () => {
    await startWorker();
    const row = await runCpr("01-expires", "Marisol Quennell");

    expect(row.status).toBe("auto_approved");
    expect(row.routing).toEqual({ decision: "auto_approve", reasons: [] });
    expect(row.asOf).toBe(AS_OF);
    expect(row.ruleResults.map((r) => r.code).sort()).toEqual(
      [
        "DATE_INCONSISTENT",
        "EXPIRED",
        "EXPIRING_SOON",
        "ISSUER_NOT_ACCEPTED",
        "LOW_CONFIDENCE",
        "MISSING_EVIDENCE",
        "MISSING_FIELD",
        "NAME_MISMATCH",
        "WRONG_DOC_TYPE",
      ].sort(),
    );
    expect(row.versions?.pipeline).toBe("21");
    expect(Object.keys(row.timingMs).sort()).toEqual([
      "classify",
      "extract",
      "rules",
    ]);
    expect(row.error).toBeNull();
  });

  it("thẻ khổ ví có ô chữ ký (06): auto_approved", async () => {
    await startWorker();
    const row = await runCpr("06-wallet-signature", "Maren Ostrowe");

    expect(row.status).toBe("auto_approved");
    expect(row.routing).toEqual({ decision: "auto_approve", reasons: [] });
  });

  it.each([
    ["02-valid-2-years", "Tobias Arkwright-Lenz", ["MISSING_FIELD", "EXPIRED"]],
    [
      "03-renewal-month",
      "Marisol Quennell",
      // Plan 21: hạn chỉ có tháng/năm.
      ["LOW_CONFIDENCE", "DATE_INCONSISTENT"],
    ],
    ["05-injection", "Odalys Venn", ["ISSUER_NOT_ACCEPTED"]],
  ])("%s: needs_review, lý do đúng", async (fixture, legalName, reasons) => {
    await startWorker();
    const row = await runCpr(fixture, legalName);

    expect(row.status).toBe("needs_review");
    expect(row.routing).toEqual({ decision: "needs_review", reasons });
    expect(row.asOf).toBe(AS_OF);
  });

  it("thẻ tốt nhưng nộp bởi người khác: NAME_MISMATCH", async () => {
    await startWorker();
    const row = await runCpr("01-expires", "Maren Ostrowe");

    expect(row.status).toBe("needs_review");
    expect(row.routing).toEqual({
      decision: "needs_review",
      reasons: ["NAME_MISMATCH"],
    });
  });

  it("giấy không phải CPR: needs_review, NO_RULES_EVALUATED, không qua extracted", async () => {
    create.mockResolvedValueOnce(IS_TB);
    await startWorker();
    const id = await addDocument(await addStaff("Maren Ostrowe"));
    await waitForJob(id);

    const row = await readDocument(id);
    expect(create).toHaveBeenCalledTimes(1);
    expect(row.status).toBe("needs_review");
    expect(row.routing).toEqual({
      decision: "needs_review",
      reasons: ["NO_RULES_EVALUATED"],
    });
    expect(row.extraction).toBeNull();
    expect(row.asOf).toBeNull();
  });

  it("bước rule lỗi một lần: retry chạy lại rule, không gọi LLM lại", async () => {
    vi.spyOn(RuleStep.prototype, "run").mockRejectedValueOnce(
      new Error(SECRET),
    );
    await startWorker();
    const row = await runCpr("01-expires", "Marisol Quennell");

    expect(create).toHaveBeenCalledTimes(2);
    expect(row.status).toBe("auto_approved");
    expect(row.error).toBeNull();
  }, 20_000);

  it("bước rule lỗi mãi: hết retry sang needs_review, giữ extraction, message cố định", async () => {
    vi.spyOn(RuleStep.prototype, "run").mockRejectedValue(new Error(SECRET));
    await startWorker();
    const row = await runCpr("01-expires", "Marisol Quennell");

    expect(create).toHaveBeenCalledTimes(2);
    expect(row.status).toBe("needs_review");
    expect(row.routing).toEqual({
      decision: "needs_review",
      reasons: ["NO_RULES_EVALUATED"],
    });
    expect(row.extraction).not.toBeNull();
    expect(row.error?.step).toBe("rules");
    expect(JSON.stringify(row.error)).not.toContain(SECRET);
  }, 20_000);
});

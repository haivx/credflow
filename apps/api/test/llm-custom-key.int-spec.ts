import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
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
import { appSettings, documents, staff } from "../src/db/schema.js";
import { LLM_CLIENT, LLM_CLIENT_FACTORY } from "../src/llm/llm.service.js";
import {
  DOCUMENT_JOB_OPTIONS,
  DOCUMENT_QUEUE_NAME,
  PROCESS_DOCUMENT_JOB,
} from "../src/queue/document-queue.js";
import { encryptSecret, parseMasterKey } from "../src/settings/secret-box.js";
import { DocumentSweepService } from "../src/worker/document-sweep.service.js";
import { WorkerModule } from "../src/worker.module.js";
import { createTestDb, makeDocument, makeStaff, truncateAll } from "./db.js";
import { testEnv } from "./test-env.js";
import { filesDir, samplePng } from "./upload.js";

// Plan 35: worker dùng khoá riêng admin đã lưu; khoá không giải mã được thì chuyển người duyệt,
// không lặng lẽ dùng khoá hệ thống.
const CUSTOM_KEY = "sk-ant-api03-khoa-rieng-cua-admin-test-9876";
const IS_TB = {
  content: [
    {
      type: "text",
      text: JSON.stringify({ docType: "tb_test", confidence: 0.97 }),
    },
  ],
  stop_reason: "end_turn",
  usage: { input_tokens: 10, output_tokens: 5 },
};

describe("worker dùng cấu hình LLM (plan 35)", () => {
  const { db, close } = createTestDb();
  const connection = { url: testEnv.REDIS_URL };
  let queue: Queue;
  let worker: TestingModule;
  let defaultCreate: ReturnType<typeof vi.fn<(p: unknown) => Promise<unknown>>>;
  let customCreate: ReturnType<typeof vi.fn<(p: unknown) => Promise<unknown>>>;
  let keysSeen: string[];
  let staffId: string;

  const startWorker = async () => {
    worker = await Test.createTestingModule({ imports: [WorkerModule] })
      .overrideProvider(LLM_CLIENT)
      .useValue({ messages: { create: defaultCreate } })
      .overrideProvider(LLM_CLIENT_FACTORY)
      .useValue({
        forKey: (apiKey: string) => {
          keysSeen.push(apiKey);
          return { messages: { create: customCreate } };
        },
      })
      .compile();
    await worker.init();
  };

  const addDocument = async () => {
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

  const doneRow = async (id: string) => {
    await vi.waitFor(
      async () => {
        expect(await queue.getJobState(id)).toBe("completed");
      },
      { timeout: 15_000, interval: 50 },
    );
    const [row] = await db.select().from(documents).where(eq(documents.id, id));
    if (row === undefined) throw new Error("không có document");
    return row;
  };

  const saveCustomKey = (ciphertext?: string) =>
    db.insert(appSettings).values({
      id: "llm",
      llmModel: "claude-haiku-5-5",
      apiKeyCiphertext:
        ciphertext ??
        encryptSecret(
          CUSTOM_KEY,
          parseMasterKey(testEnv.SETTINGS_ENCRYPTION_KEY),
        ),
      apiKeyLast4: "9876",
    });

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
    defaultCreate = vi.fn<(p: unknown) => Promise<unknown>>();
    customCreate = vi.fn<(p: unknown) => Promise<unknown>>();
    keysSeen = [];
    vi.spyOn(DocumentSweepService.prototype, "run").mockResolvedValue();
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await worker.close();
  });

  it("chưa đặt khoá riêng → dùng client hệ thống, versions.model = Haiku 5.5", async () => {
    defaultCreate.mockResolvedValue(IS_TB);
    await startWorker();
    const row = await doneRow(await addDocument());
    expect(defaultCreate).toHaveBeenCalledTimes(1);
    expect(customCreate).not.toHaveBeenCalled();
    expect(row.versions?.model).toBe("claude-haiku-5-5");
  });

  it("đã đặt khoá riêng → client tạo từ đúng khoá đó, không đụng client hệ thống", async () => {
    await saveCustomKey();
    customCreate.mockResolvedValue(IS_TB);
    await startWorker();
    const row = await doneRow(await addDocument());
    expect(keysSeen).toEqual([CUSTOM_KEY]);
    expect(customCreate).toHaveBeenCalledTimes(1);
    expect(defaultCreate).not.toHaveBeenCalled();
    expect(row.versions?.model).toBe("claude-haiku-5-5");
  });

  it("khoá riêng không giải mã được → chuyển người duyệt có lỗi, không gọi LLM nào", async () => {
    await saveCustomKey("v1:hong:hong:hong");
    await startWorker();
    const row = await doneRow(await addDocument());
    expect(row.status).toBe("needs_review");
    expect(row.error?.message).toMatch(/Cài đặt/);
    expect(defaultCreate).not.toHaveBeenCalled();
    expect(customCreate).not.toHaveBeenCalled();
  });
});

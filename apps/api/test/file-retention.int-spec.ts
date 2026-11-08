import { ConfigService } from "@nestjs/config";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "../src/db/db.provider.js";
import { documents, staff } from "../src/db/schema.js";
import { LocalStorage } from "../src/storage/local-storage.js";
import { FileRetentionService } from "../src/worker/file-retention.service.js";
import { createTestDb, makeDocument, makeStaff, truncateAll } from "./db.js";

// Plan 34: xoá file của giấy nộp quá FILE_RETENTION_DAYS ngày, giữ dòng DB.
const DAY_MS = 24 * 60 * 60 * 1000;

describe("FileRetentionService (plan 34)", () => {
  let db: Db;
  let close: () => Promise<void>;
  let dataDir: string;
  let storage: LocalStorage;
  let service: FileRetentionService;
  let staffId: string;
  const now = new Date("2026-11-08T03:00:00.000Z");

  beforeAll(() => {
    ({ db, close } = createTestDb());
  });
  afterAll(async () => {
    await close();
  });
  beforeEach(async () => {
    await truncateAll(db);
    dataDir = await mkdtemp(join(tmpdir(), "credflow-retention-"));
    storage = new LocalStorage(dataDir);
    await storage.init();
    service = new FileRetentionService(db, storage, new ConfigService());
    const s = makeStaff();
    await db.insert(staff).values(s);
    staffId = s.id;
  });

  async function docWithFile(ageDays: number, label: string) {
    const doc = makeDocument(staffId, {
      createdAt: new Date(now.getTime() - ageDays * DAY_MS),
      storageKey: `documents/${label}.png`,
    });
    await db.insert(documents).values(doc);
    const tmp = join(storage.tmpDir, label);
    await writeFile(tmp, `SAMPLE ${label}`);
    await storage.putFromTemp(tmp, `documents/${label}.png`);
    return doc;
  }
  const row = async (id: string) =>
    (await db.select().from(documents).where(eq(documents.id, id)))[0];

  it("giấy quá hạn: file bị xoá, ghi file_deleted_at, dòng còn; giấy mới giữ nguyên", async () => {
    const old = await docWithFile(4, "old");
    const fresh = await docWithFile(1, "fresh");

    expect(await service.purgeOnce(now, 3)).toBe(1);

    expect(await storage.read("documents/old.png")).toBeNull();
    expect((await row(old.id ?? ""))?.fileDeletedAt?.toISOString()).toBe(
      now.toISOString(),
    );
    expect(await storage.read("documents/fresh.png")).not.toBeNull();
    expect((await row(fresh.id ?? ""))?.fileDeletedAt).toBeNull();

    await rm(dataDir, { recursive: true, force: true });
  });

  it("chạy lại không xoá lại và không lỗi", async () => {
    await docWithFile(5, "again");
    expect(await service.purgeOnce(now, 3)).toBe(1);
    expect(await service.purgeOnce(now, 3)).toBe(0);
    await rm(dataDir, { recursive: true, force: true });
  });

  it("FILE_RETENTION_DAYS = 0 → không xoá gì", async () => {
    await docWithFile(30, "keep");
    expect(await service.purgeOnce(now, 0)).toBe(0);
    expect(await storage.read("documents/keep.png")).not.toBeNull();
    await rm(dataDir, { recursive: true, force: true });
  });
});

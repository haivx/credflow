import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LocalStorage } from "./local-storage.js";

describe("LocalStorage", () => {
  let dataDir: string;
  let storage: LocalStorage;

  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), "credflow-storage-"));
    storage = new LocalStorage(dataDir);
    await storage.init();
  });

  afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true });
  });

  it("putFromTemp chuyển file tạm vào files/<key>, tmp không còn file", async () => {
    const tmpPath = join(storage.tmpDir, "upload-1");
    await writeFile(tmpPath, "SAMPLE");

    await storage.putFromTemp(tmpPath, "documents/doc1.pdf");

    expect(
      await readFile(join(dataDir, "files", "documents", "doc1.pdf"), "utf8"),
    ).toBe("SAMPLE");
    expect(await readdir(storage.tmpDir)).toEqual([]);
  });

  it("remove xoá file; gọi lại khi đã xoá thì không lỗi", async () => {
    const tmpPath = join(storage.tmpDir, "upload-2");
    await writeFile(tmpPath, "SAMPLE");
    await storage.putFromTemp(tmpPath, "documents/doc2.png");

    await storage.remove("documents/doc2.png");
    await storage.remove("documents/doc2.png");

    expect(await readdir(join(dataDir, "files", "documents"))).toEqual([]);
  });

  it("key thoát ra ngoài thư mục files → throw", () => {
    expect(() => storage.pathOf("../tmp/x")).toThrow(/không hợp lệ/);
    expect(() => storage.pathOf("../../etc/passwd")).toThrow(/không hợp lệ/);
  });
});

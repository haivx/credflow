import { readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buffer } from "node:stream/consumers";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Storage } from "../src/storage/storage.js";

/**
 * Bộ ca kiểm dùng chung cho mọi cài đặt `Storage` (plan 33): LocalStorage (unit) và S3Storage
 * (integration, s3mock). Một bộ cho cả hai để hai cài đặt không lệch hành vi nhau.
 * `setup` tạo storage sạch; `teardown` dọn sau mỗi ca.
 */
export function describeStorageContract(
  name: string,
  setup: () => Promise<Storage>,
  teardown: () => Promise<void> = async () => {},
) {
  describe(`Storage contract: ${name}`, () => {
    let storage: Storage;
    let seq = 0;

    beforeEach(async () => {
      storage = await setup();
    });
    afterEach(async () => {
      await teardown();
    });

    async function putText(key: string, text: string) {
      seq += 1;
      const tmpPath = join(storage.tmpDir, `upload-${String(seq)}`);
      await writeFile(tmpPath, text);
      await storage.putFromTemp(tmpPath, key);
      return tmpPath;
    }

    it("putFromTemp lưu đúng nội dung; file tạm không còn", async () => {
      const tmpPath = await putText("documents/a.png", "SAMPLE-A");

      expect((await storage.read("documents/a.png"))?.toString("utf8")).toBe(
        "SAMPLE-A",
      );
      expect(await readdir(storage.tmpDir)).not.toContain(
        tmpPath.split("/").pop(),
      );
    });

    it("openRead stream đúng nội dung", async () => {
      await putText("documents/b.pdf", "SAMPLE-STREAM");

      const stream = await storage.openRead("documents/b.pdf");
      expect(stream).not.toBeNull();
      if (stream === null) return;
      expect((await buffer(stream)).toString("utf8")).toBe("SAMPLE-STREAM");
    });

    it("key không có → read và openRead trả null", async () => {
      expect(await storage.read("documents/khong-co.png")).toBeNull();
      expect(await storage.openRead("documents/khong-co.png")).toBeNull();
    });

    it("remove xoá file; gọi lại khi đã xoá thì không lỗi", async () => {
      await putText("documents/c.png", "SAMPLE-C");

      await storage.remove("documents/c.png");
      await storage.remove("documents/c.png");

      expect(await storage.read("documents/c.png")).toBeNull();
    });

    it("key thoát ra ngoài (`..`) → lỗi, không đọc", async () => {
      await expect(storage.read("../ngoai.txt")).rejects.toThrow();
      await expect(storage.openRead("documents/../../x")).rejects.toThrow();
    });
  });
}

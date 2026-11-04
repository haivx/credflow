import { createHash } from "node:crypto";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FileTooLargeError, hashToTempFile } from "./hash-to-temp-file.js";

const sha256 = (data: Buffer) =>
  createHash("sha256").update(data).digest("hex");

describe("hashToTempFile", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "credflow-hash-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("tính sha256, sizeBytes và ghi đúng nội dung vào một file trong tmpDir", async () => {
    const content = Buffer.from("%PDF-1.4\nSAMPLE CPR card, fictional data\n");

    const result = await hashToTempFile(Readable.from([content]), {
      tmpDir,
      maxBytes: 1024,
    });

    expect(result.sha256).toBe(sha256(content));
    expect(result.sizeBytes).toBe(content.length);
    expect(dirname(result.tmpPath)).toBe(tmpDir);
    expect(await readFile(result.tmpPath)).toEqual(content);
  });

  it("nhiều chunk nhỏ cho cùng hash với cả file một lần", async () => {
    const chunks = Array.from({ length: 100 }, (_, i) =>
      Buffer.from(`SAMPLE-${i}-`),
    );
    const whole = Buffer.concat(chunks);

    const result = await hashToTempFile(Readable.from(chunks), {
      tmpDir,
      maxBytes: whole.length,
    });

    expect(result.sha256).toBe(sha256(whole));
    expect(result.sizeBytes).toBe(whole.length);
  });

  it("đúng bằng maxBytes thì qua", async () => {
    const content = Buffer.alloc(64, 0x41);

    const result = await hashToTempFile(Readable.from([content]), {
      tmpDir,
      maxBytes: 64,
    });

    expect(result.sizeBytes).toBe(64);
  });

  it("maxBytes + 1 → FileTooLargeError, không để lại file nào trong tmpDir", async () => {
    const content = Buffer.alloc(65, 0x41);

    await expect(
      hashToTempFile(Readable.from([content]), { tmpDir, maxBytes: 64 }),
    ).rejects.toBeInstanceOf(FileTooLargeError);
    expect(await readdir(tmpDir)).toEqual([]);
  });

  it("vượt giới hạn thì dừng ngay, không đọc tiếp source (source vô hạn vẫn kết thúc)", async () => {
    let chunksRead = 0;
    async function* endless() {
      for (;;) {
        chunksRead += 1;
        yield Buffer.alloc(1024, 0x41);
      }
    }

    await expect(
      hashToTempFile(Readable.from(endless()), {
        tmpDir,
        maxBytes: 4 * 1024,
      }),
    ).rejects.toBeInstanceOf(FileTooLargeError);
    // Vài chunk dư do buffer của stream là bình thường; đọc hàng trăm chunk là chưa dừng.
    expect(chunksRead).toBeLessThan(50);
    expect(await readdir(tmpDir)).toEqual([]);
  });

  it("source lỗi giữa chừng (client ngắt kết nối) → reject đúng lỗi đó, không để lại file", async () => {
    async function* broken() {
      yield Buffer.from("SAMPLE part 1");
      await Promise.resolve();
      throw new Error("ECONNRESET giả lập");
    }

    await expect(
      hashToTempFile(Readable.from(broken()), { tmpDir, maxBytes: 1024 }),
    ).rejects.toThrow("ECONNRESET giả lập");
    expect(await readdir(tmpDir)).toEqual([]);
  });

  it("stream rỗng → sizeBytes 0 và sha256 của chuỗi rỗng (service mới là nơi chặn file rỗng)", async () => {
    const result = await hashToTempFile(Readable.from([]), {
      tmpDir,
      maxBytes: 1024,
    });

    expect(result.sizeBytes).toBe(0);
    expect(result.sha256).toBe(sha256(Buffer.alloc(0)));
  });

  it("hai lần gọi song song ghi ra hai file tạm khác nhau", async () => {
    const [a, b] = await Promise.all([
      hashToTempFile(Readable.from([Buffer.from("SAMPLE a")]), {
        tmpDir,
        maxBytes: 1024,
      }),
      hashToTempFile(Readable.from([Buffer.from("SAMPLE b")]), {
        tmpDir,
        maxBytes: 1024,
      }),
    ]);

    expect(a.tmpPath).not.toBe(b.tmpPath);
    expect(await readFile(a.tmpPath, "utf8")).toBe("SAMPLE a");
    expect(await readFile(b.tmpPath, "utf8")).toBe("SAMPLE b");
  });
});

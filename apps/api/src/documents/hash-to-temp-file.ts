import type { Readable } from "node:stream";
import { join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { pipeline } from "node:stream/promises";
import { createWriteStream } from "node:fs";
import { rm } from "node:fs/promises";

/** File vượt giới hạn dung lượng upload. Controller map sang 413 PAYLOAD_TOO_LARGE. */
export class FileTooLargeError extends Error {
  constructor(readonly maxBytes: number) {
    super(`File vượt quá giới hạn ${maxBytes} byte`);
    this.name = "FileTooLargeError";
  }
}

export interface HashedTempFile {
  /** sha256 hex chữ thường của toàn bộ nội dung. */
  sha256: string;
  sizeBytes: number;
  /** Đường dẫn tuyệt đối của file tạm, nằm trong `tmpDir`. */
  tmpPath: string;
}

/**
 * Stream `source` vào một file mới trong `tmpDir`, vừa ghi vừa tính sha256 và đếm byte.
 * Không giữ cả file trong memory. Vượt `maxBytes` → dừng đọc, throw FileTooLargeError.
 * Lỗi bất kỳ → xoá file tạm rồi mới throw.
 *
 * 🎓 Liam tự viết (plan 11). Spec: hash-to-temp-file.spec.ts.
 */
export async function hashToTempFile(
  source: Readable,
  opts: { tmpDir: string; maxBytes: number },
): Promise<HashedTempFile> {
  const tmpPath = join(opts.tmpDir, `${randomUUID()}.tmp`);
  const hash = createHash("sha256");
  let sizeBytes = 0;

  // Trạm kiểm tra: nhận từng chunk, làm việc của mình, rồi chuyền chunk đi tiếp.
  async function* check(chunks: AsyncIterable<Buffer>) {
    for await (const chunk of chunks) {
      sizeBytes += chunk.length;
      // Throw ở đây → pipeline destroy source và file đang ghi, không đọc tiếp nữa.
      if (sizeBytes > opts.maxBytes) {
        throw new FileTooLargeError(opts.maxBytes);
      }
      hash.update(chunk);
      yield chunk;
    }
  }

  try {
    await pipeline(source, check, createWriteStream(tmpPath));
  } catch (err) {
    // Destroy write stream không xoá phần đã ghi. force: file chưa kịp tạo cũng không lỗi.
    await rm(tmpPath, { force: true });
    throw err;
  }

  return { sha256: hash.digest("hex"), sizeBytes, tmpPath };
}

import { rm } from "node:fs/promises";
import type { Readable } from "node:stream";
import { BadRequestException, PayloadTooLargeException } from "@nestjs/common";
import busboy from "busboy";
import type { Request } from "express";
import {
  FileTooLargeError,
  type HashedTempFile,
  hashToTempFile,
} from "./hash-to-temp-file.js";

/** Tên field chứa file trong multipart POST /documents. */
export const FILE_FIELD = "file";

export interface UploadedTempFile extends HashedTempFile {
  /** Tên file người dùng đặt, chỉ để hiển thị. Không dùng làm đường dẫn. */
  fileName: string;
}

export interface ParsedUpload {
  /** Field text thô, controller/service validate bằng Zod. */
  fields: Record<string, string>;
  file: UploadedTempFile;
}

const MAX_FILE_NAME = 255;

/**
 * Đọc multipart từ request bằng busboy: đúng một file ở field `file` (stream thẳng xuống tmpDir
 * qua hashToTempFile) cộng vài field text. Lỗi thì không để lại file tạm.
 */
export async function parseUpload(
  req: Request,
  opts: { tmpDir: string; maxBytes: number },
): Promise<ParsedUpload> {
  let bb: busboy.Busboy;
  try {
    bb = busboy({
      headers: req.headers,
      limits: {
        files: 1,
        fields: 5,
        parts: 6,
        // MAX + 1: busboy không báo lỗi khi quá giới hạn, chỉ cắt file. Cho nó cắt ở MAX + 1
        // thì hashToTempFile vẫn thấy vượt và throw: chỉ một chỗ quyết định "quá lớn".
        fileSize: opts.maxBytes + 1,
      },
    });
  } catch {
    // busboy throw khi Content-Type không phải multipart hoặc thiếu boundary.
    throw new BadRequestException(
      "Request phải là multipart/form-data có field file",
    );
  }

  const fields: Record<string, string> = {};
  let fileStream: Readable | undefined;
  let file: Promise<UploadedTempFile> | undefined;
  let problem: string | undefined;

  const done = new Promise<void>((resolve, reject) => {
    bb.on("field", (name, value) => {
      // Form gửi select rỗng thành chuỗi rỗng: coi như không chọn.
      if (value !== "") fields[name] = value;
    });
    bb.on("file", (name, stream, info) => {
      if (name !== FILE_FIELD) {
        problem ??= `File phải gửi ở field "${FILE_FIELD}"`;
        stream.resume(); // Phải đọc hết stream bỏ đi, không thì busboy đứng chờ.
        return;
      }
      fileStream = stream;
      file = hashToTempFile(stream, opts).then((hashed) => ({
        ...hashed,
        fileName: (info.filename ?? "").slice(0, MAX_FILE_NAME) || "upload",
      }));
      // File lỗi (quá lớn, ghi đĩa lỗi): reject ngay. Stream đã bị pipeline destroy nên busboy
      // sẽ không bao giờ phát "close", chờ nó thì request treo mãi.
      file.catch(reject);
    });
    bb.on("filesLimit", () => {
      problem ??= "Chỉ nhận một file mỗi lần upload";
    });
    bb.on("fieldsLimit", () => {
      problem ??= "Quá nhiều field";
    });
    bb.on("partsLimit", () => {
      problem ??= "Quá nhiều part";
    });
    bb.on("close", resolve);
    bb.on("error", reject);
    // Client ngắt kết nối giữa chừng: busboy không biết, file stream không bao giờ end.
    // Destroy file stream để hashToTempFile reject và tự dọn file tạm.
    req.on("close", () => {
      if (!req.complete) {
        const aborted = new Error("Client ngắt kết nối khi đang upload");
        fileStream?.destroy(aborted);
        reject(aborted);
      }
    });
  });

  req.pipe(bb);

  try {
    await done;
    if (file === undefined) {
      throw new BadRequestException(`Thiếu file ở field "${FILE_FIELD}"`);
    }
    const uploaded = await file;
    if (problem !== undefined) {
      await rm(uploaded.tmpPath, { force: true });
      throw new BadRequestException(problem);
    }
    return { fields, file: uploaded };
  } catch (err) {
    // Ngừng đưa dữ liệu vào busboy nhưng vẫn đọc hết phần body còn lại rồi bỏ đi:
    // đóng kết nối khi client đang gửi thì client thấy EPIPE thay vì đọc được response lỗi.
    req.unpipe(bb);
    req.resume();
    // Lỗi không đến từ file (busboy lỗi, thừa file...) mà file đã ghi xong: dọn file tạm.
    // Không await: nếu file stream đang kẹt thì promise này có thể không bao giờ xong.
    void file?.then(
      (f) => rm(f.tmpPath, { force: true }),
      () => undefined,
    );
    if (err instanceof FileTooLargeError) {
      throw new PayloadTooLargeException(`File vượt quá ${err.maxBytes} byte`);
    }
    throw err;
  }
}

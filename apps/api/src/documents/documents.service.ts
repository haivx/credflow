import { open, rm } from "node:fs/promises";
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  UnsupportedMediaTypeException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  type UploadDocumentResponse,
  UploadDocumentFields,
} from "@credflow/contracts";
import { eq } from "drizzle-orm";
import { ulid } from "ulid";
import { formatErrorForLog, getPgErrorCode } from "../common/pg-error.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import type { Env } from "../config/env.schema.js";
import { type Db, DB } from "../db/db.provider.js";
import { documents } from "../db/schema.js";
import { DOCUMENT_QUEUE, type DocumentQueue } from "../queue/document-queue.js";
import { STORAGE, type Storage } from "../storage/storage.js";
import { detectFileType, FILE_TYPE_HEAD_BYTES } from "./file-type.js";
import type { ParsedUpload } from "./upload-parser.js";

const fieldsPipe = new ZodValidationPipe(UploadDocumentFields);

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger("DocumentsService");

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(STORAGE) private readonly storage: Storage,
    @Inject(DOCUMENT_QUEUE) private readonly queue: DocumentQueue,
    private readonly config: ConfigService<Env, true>,
  ) {}

  uploadOptions(): { tmpDir: string; maxBytes: number } {
    return {
      tmpDir: this.storage.tmpDir,
      maxBytes: this.config.get("UPLOAD_MAX_BYTES", { infer: true }),
    };
  }

  /**
   * Tạo document từ file đã stream xong vào tmp. Cùng sha256 đã có:
   * của chính staff này → trả document cũ (duplicate); của staff khác → 409.
   * Mọi nhánh đều không để lại file tạm.
   */
  async createFromUpload(
    staffId: string,
    { fields, file }: ParsedUpload,
  ): Promise<UploadDocumentResponse> {
    try {
      const { declaredDocType } = fieldsPipe.transform(fields);
      if (file.sizeBytes === 0) {
        throw new BadRequestException("File rỗng");
      }
      const type = detectFileType(await readHead(file.tmpPath));
      if (type === null) {
        throw new UnsupportedMediaTypeException(
          "Chỉ nhận file PDF, PNG hoặc JPEG",
        );
      }

      const existing = await this.findByChecksum(file.sha256);
      if (existing !== undefined) return toDuplicate(existing, staffId);

      const id = ulid();
      const storageKey = `documents/${id}.${type.ext}`;
      // Ghi file trước, INSERT sau: INSERT lỗi thì chỉ còn một file mồ côi (vô hại),
      // còn làm ngược lại thì DB có thể trỏ tới file không tồn tại.
      await this.storage.putFromTemp(file.tmpPath, storageKey);
      let created: UploadDocumentResponse;
      try {
        const [row] = await this.db
          .insert(documents)
          .values({
            id,
            staffId,
            fileName: file.fileName,
            mimeType: type.mimeType,
            storageKey,
            declaredDocType,
            checksum: file.sha256,
            sizeBytes: file.sizeBytes,
          })
          .returning({ id: documents.id, status: documents.status });
        if (row === undefined) throw new Error("INSERT không trả về dòng");
        created = { documentId: row.id, status: row.status, duplicate: false };
      } catch (err) {
        await this.storage.remove(storageKey);
        // 23505: request khác cùng file vừa INSERT trước (giữa SELECT ở trên và INSERT này).
        // Unique index là thứ duy nhất chặn được race này; đọc lại rồi xử lý như ca trùng.
        if (getPgErrorCode(err) === "23505") {
          const winner = await this.findByChecksum(file.sha256);
          if (winner !== undefined) return toDuplicate(winner, staffId);
        }
        throw err;
      }
      // Đặt ngoài try trên: enqueue lỗi không được xoá file của document đã commit.
      await this.enqueue(created.documentId);
      return created;
    } finally {
      // Nhánh thành công đã rename file đi, rm với force thì không lỗi.
      await rm(file.tmpPath, { force: true });
    }
  }

  /**
   * Dual-write: DB đã commit, không gói chung transaction với Redis được. `add` lỗi thì vẫn trả
   * thành công, vì giấy đã được nhận; document nằm ở `uploaded` chờ sweep job (plan 13).
   */
  private async enqueue(documentId: string): Promise<void> {
    try {
      await this.queue.enqueue(documentId);
    } catch (err) {
      const { message, stack } = formatErrorForLog(err);
      this.logger.error(
        `enqueue lỗi, document ${documentId}: ${message}`,
        stack,
      );
    }
  }

  private async findByChecksum(checksum: string) {
    const [row] = await this.db
      .select({
        id: documents.id,
        staffId: documents.staffId,
        status: documents.status,
      })
      .from(documents)
      .where(eq(documents.checksum, checksum));
    return row;
  }
}

function toDuplicate(
  existing: {
    id: string;
    staffId: string;
    status: UploadDocumentResponse["status"];
  },
  staffId: string,
): UploadDocumentResponse {
  if (existing.staffId !== staffId) {
    // Checksum unique toàn cục (plan 11): một file giấy tờ chỉ thuộc một người.
    throw new ConflictException("File này đã được một nhân viên khác nộp");
  }
  return { documentId: existing.id, status: existing.status, duplicate: true };
}

/** Đọc vài byte đầu file để nhận dạng loại, không đọc cả file. */
async function readHead(path: string): Promise<Buffer> {
  const handle = await open(path, "r");
  try {
    const buffer = Buffer.alloc(FILE_TYPE_HEAD_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

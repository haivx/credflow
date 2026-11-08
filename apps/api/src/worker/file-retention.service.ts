import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { and, asc, eq, isNull, lt } from "drizzle-orm";
import { formatErrorForLog } from "../common/pg-error.js";
import type { Env } from "../config/env.schema.js";
import { type Db, DB } from "../db/db.provider.js";
import { documents } from "../db/schema.js";
import { STORAGE, type Storage } from "../storage/storage.js";

const DAY_MS = 24 * 60 * 60 * 1000;
export const RETENTION_BATCH_SIZE = 100;

/**
 * Xoá file của giấy nộp quá FILE_RETENTION_DAYS ngày (plan 34): demo công khai không giữ file
 * người khác nộp lâu hơn mức cần. Chỉ xoá file trên storage và ghi `file_deleted_at`; dòng DB,
 * kết quả đọc, lịch sử duyệt giữ nguyên (`review_actions` chỉ insert).
 * Xoá file trước, ghi cột sau: ghi lỗi thì lần chạy sau xoá lại (xoá file không có không lỗi).
 */
@Injectable()
export class FileRetentionService {
  private readonly logger = new Logger("FileRetention");

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(STORAGE) private readonly storage: Storage,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Điểm vào của job định kỳ. Đổi lỗi trước khi ném vì BullMQ lưu message vào Redis (A14). */
  async run(): Promise<void> {
    try {
      await this.purgeOnce(
        new Date(),
        this.config.get("FILE_RETENTION_DAYS", { infer: true }),
      );
    } catch (err) {
      const { message, stack } = formatErrorForLog(err);
      this.logger.error(`dọn file lỗi: ${message}`, stack);
      throw new Error("Dọn file lỗi, xem log worker");
    }
  }

  /** Trả số file đã xoá. `retentionDays = 0` là tắt. */
  async purgeOnce(now: Date, retentionDays: number): Promise<number> {
    if (retentionDays <= 0) return 0;
    const cutoff = new Date(now.getTime() - retentionDays * DAY_MS);
    let total = 0;
    for (;;) {
      const rows = await this.db
        .select({ id: documents.id, storageKey: documents.storageKey })
        .from(documents)
        .where(
          and(lt(documents.createdAt, cutoff), isNull(documents.fileDeletedAt)),
        )
        .orderBy(asc(documents.createdAt), asc(documents.id))
        .limit(RETENTION_BATCH_SIZE);
      for (const row of rows) {
        await this.storage.remove(row.storageKey);
        await this.db
          .update(documents)
          .set({ fileDeletedAt: now })
          .where(
            and(eq(documents.id, row.id), isNull(documents.fileDeletedAt)),
          );
      }
      total += rows.length;
      if (rows.length < RETENTION_BATCH_SIZE) break;
    }
    if (total > 0) this.logger.log(`đã xoá file của ${String(total)} giấy`);
    return total;
  }
}

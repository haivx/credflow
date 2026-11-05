import { Inject, Injectable, Logger } from "@nestjs/common";
import type { DocumentStatus } from "@credflow/contracts";
import { route } from "@credflow/rules";
import { and, asc, eq, lt, or } from "drizzle-orm";
import { formatErrorForLog } from "../common/pg-error.js";
import { type Db, DB } from "../db/db.provider.js";
import { documents } from "../db/schema.js";
import {
  DocumentStatusConflictError,
  DocumentStatusService,
} from "../documents/document-status.service.js";
import { BullDocumentQueue } from "../queue/queue.module.js";

/** Upload thường đẩy job ngay; quá 1 phút chưa có gì thì coi như `add` đã lỗi. */
export const UPLOADED_STALE_MS = 60_000;
/** Lâu hơn tổng thời gian retry. Job còn sống thì vẫn được bỏ qua, ngưỡng chỉ để bớt việc kiểm. */
export const PROCESSING_STALE_MS = 15 * 60_000;
export const SWEEP_BATCH_SIZE = 100;

/**
 * Cứu document kẹt do dual-write hoặc do job chết giữa chừng (ADR 0007).
 * `uploaded`: đẩy lại job. `processing` không còn job sống: chuyển người duyệt, không chạy lại,
 * để document làm hỏng worker không lặp mãi và không tốn thêm tiền LLM.
 */
@Injectable()
export class DocumentSweepService {
  private readonly logger = new Logger("DocumentSweep");

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly queue: BullDocumentQueue,
    private readonly status: DocumentStatusService,
  ) {}

  /** Điểm vào của job định kỳ. BullMQ lưu message và stack vào Redis nên đổi lỗi trước khi ném (A14). */
  async run(): Promise<void> {
    try {
      await this.sweepOnce(new Date());
    } catch (err) {
      const { message, stack } = formatErrorForLog(err);
      this.logger.error(`sweep lỗi: ${message}`, stack);
      throw new Error("Sweep lỗi, xem log worker");
    }
  }

  async sweepOnce(now: Date): Promise<void> {
    const rows = await this.db
      .select({ id: documents.id, status: documents.status })
      .from(documents)
      .where(
        or(
          and(
            eq(documents.status, "uploaded"),
            lt(
              documents.updatedAt,
              new Date(now.getTime() - UPLOADED_STALE_MS),
            ),
          ),
          and(
            eq(documents.status, "processing"),
            lt(
              documents.updatedAt,
              new Date(now.getTime() - PROCESSING_STALE_MS),
            ),
          ),
        ),
      )
      .orderBy(asc(documents.updatedAt))
      .limit(SWEEP_BATCH_SIZE);

    for (const { id, status } of rows) {
      try {
        await this.sweepDocument(id, status);
      } catch (err) {
        // Một document lỗi không được chặn các document còn lại; vòng sau thử lại.
        const { message, stack } = formatErrorForLog(err);
        this.logger.error(`sweep document ${id} lỗi: ${message}`, stack);
      }
    }
  }

  private async sweepDocument(
    id: string,
    status: DocumentStatus,
  ): Promise<void> {
    if (await this.queue.hasLiveJob(id)) return;

    if (status === "uploaded") {
      await this.queue.requeue(id);
      this.logger.warn(`sweep đẩy lại document ${id}`);
      return;
    }

    try {
      await this.status.transition(id, "processing", "needs_review", {
        routing: route([]),
        ruleResults: [],
        // Message cố định, không chép lỗi gốc (A14).
        error: { step: "sweep", message: "Xử lý bị gián đoạn" },
      });
      this.logger.warn(`sweep chuyển document ${id} sang needs_review`);
    } catch (err) {
      // Worker vừa ghi xong đúng lúc này: document đã có kết quả, không còn gì phải cứu.
      if (!(err instanceof DocumentStatusConflictError)) throw err;
    }
  }
}

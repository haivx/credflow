import { Inject, Injectable, Logger } from "@nestjs/common";
import {
  type DocumentStatus,
  ProcessDocumentJob,
  type RulesConfig,
} from "@credflow/contracts";
import { route } from "@credflow/rules";
import { type Job, UnrecoverableError } from "bullmq";
import { eq } from "drizzle-orm";
import { formatErrorForLog } from "../common/pg-error.js";
import { type Db, DB } from "../db/db.provider.js";
import { documents } from "../db/schema.js";
import {
  DocumentStatusConflictError,
  DocumentStatusService,
} from "../documents/document-status.service.js";
import {
  PIPELINE,
  PIPELINE_VERSIONS,
  type Pipeline,
  UnreadableFileError,
} from "../pipeline/pipeline.js";
import { RULES_CONFIG } from "../rules/rules-config.provider.js";

@Injectable()
export class DocumentProcessor {
  private readonly logger = new Logger("DocumentProcessor");

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(PIPELINE) private readonly pipeline: Pipeline,
    @Inject(RULES_CONFIG) private readonly rules: RulesConfig,
    private readonly status: DocumentStatusService,
  ) {}

  /**
   * `Job<unknown>`: `Job<Foo>` chỉ là khai báo, không kiểm gì lúc chạy. Khai `unknown` thì
   * compiler buộc phải parse mới đọc được dữ liệu từ Redis (A2).
   */
  async process(job: Job<unknown>): Promise<void> {
    try {
      await this.handle(job);
    } catch (err) {
      if (err instanceof UnrecoverableError) throw err;
      // Dòng đã được process khác đổi (job trùng, sweep): việc đã có người làm, không retry.
      if (err instanceof DocumentStatusConflictError) {
        this.logger.warn(
          `document ${err.documentId} đã được xử lý nơi khác, bỏ qua job`,
        );
        return;
      }
      const { message, stack } = formatErrorForLog(err);
      this.logger.error(`job ${String(job.id)}: ${message}`, stack);
      // BullMQ lưu message và stack của lỗi vào Redis. Lỗi Drizzle có `params` nên phải đổi thành
      // lỗi không chứa dữ liệu (A14). Chi tiết nằm trong log ở trên.
      throw new Error("Job xử lý document lỗi, xem log worker");
    }
  }

  private async handle(job: Job<unknown>): Promise<void> {
    const parsed = ProcessDocumentJob.safeParse(job.data);
    if (!parsed.success) {
      this.logger.error(`job ${String(job.id)}: dữ liệu job sai schema`);
      throw new UnrecoverableError("Dữ liệu job sai schema");
    }
    const { documentId } = parsed.data;

    const status = await this.readStatus(documentId);
    if (status === undefined) {
      this.logger.error(`job ${String(job.id)}: không có document`);
      throw new UnrecoverableError("Không có document");
    }

    if (status === "uploaded") {
      await this.status.transition(documentId, "uploaded", "processing", {
        versions: {
          ...PIPELINE_VERSIONS,
          rules: String(this.rules.version),
        },
      });
    } else if (status !== "processing") {
      // `processing` là lần retry hoặc job stalled, chạy tiếp. Còn lại là đã xử lý xong.
      this.logger.warn(`document ${documentId} đã ở ${status}, bỏ qua job`);
      return;
    }

    try {
      const { status: to, ...fields } = await this.pipeline.run(documentId);
      await this.status.transition(documentId, "processing", to, fields);
    } catch (err) {
      if (err instanceof UnreadableFileError) {
        await this.status.transition(documentId, "processing", "failed", {
          error: { step: "pipeline", message: "File không đọc được" },
        });
        throw new UnrecoverableError("File không đọc được");
      }
      if (!isLastAttempt(job)) throw err;

      // Hết lượt: chuyển cho người duyệt (ADR 0006). Message cố định, không chép lỗi gốc (A14).
      const { message, stack } = formatErrorForLog(err);
      this.logger.error(`document ${documentId} hết retry: ${message}`, stack);
      await this.status.transition(documentId, "processing", "needs_review", {
        routing: route([]),
        ruleResults: [],
        error: { step: "pipeline", message: "Lỗi kỹ thuật sau khi đã thử lại" },
      });
    }
  }

  private async readStatus(
    documentId: string,
  ): Promise<DocumentStatus | undefined> {
    const [row] = await this.db
      .select({ status: documents.status })
      .from(documents)
      .where(eq(documents.id, documentId));
    return row?.status;
  }
}

/** `attemptsMade` là số lần đã chạy xong trước lần này; int test kiểm bằng số lần pipeline được gọi. */
function isLastAttempt(job: Job<unknown>): boolean {
  return job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
}

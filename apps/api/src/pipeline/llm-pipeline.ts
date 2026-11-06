import { Inject, Injectable, Logger } from "@nestjs/common";
import type { Classification, Extraction } from "@credflow/contracts";
import { route } from "@credflow/rules";
import { eq } from "drizzle-orm";
import { type Db, DB } from "../db/db.provider.js";
import { documents } from "../db/schema.js";
import { LlmError, type LlmDocument, LlmService } from "../llm/llm.service.js";
import { STORAGE, type Storage } from "../storage/storage.js";
import {
  type NeedsReviewResult,
  type Pipeline,
  type PipelineResult,
  UnreadableFileError,
} from "./pipeline.js";

/**
 * Đọc file → phân loại → trích xuất (chỉ CPR ở P1). Thẻ đọc được thì trả `extracted`, worker chạy
 * rule ở bước sau (plan 16). Loại giấy khác chưa có rule: `route([])`, chuyển người duyệt.
 */
@Injectable()
export class LlmPipeline implements Pipeline {
  private readonly logger = new Logger("LlmPipeline");

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(STORAGE) private readonly storage: Storage,
    private readonly llm: LlmService,
  ) {}

  async run(documentId: string): Promise<PipelineResult> {
    const doc = await this.readDocument(documentId);
    const timingMs: Record<string, number> = {};
    let classification: Classification | undefined;
    let extraction: Extraction | undefined;

    try {
      classification = await timed(timingMs, "classify", () =>
        this.llm.classify(doc),
      );
      if (classification.docType === "cpr_card") {
        extraction = await timed(timingMs, "extract", () =>
          this.llm.extractCpr(doc),
        );
      }
    } catch (err) {
      if (!(err instanceof LlmError) || err.retryable) throw err;
      // Thử lại vô ích: chuyển người duyệt ngay, giữ phần đã đọc được. Message cố định (A14).
      this.logger.error(`document ${documentId}: ${err.message}`);
      return {
        ...needsReview(classification, extraction, timingMs),
        error: { step: err.step, message: "LLM không xử lý được giấy này" },
      };
    }

    if (classification === undefined || extraction === undefined) {
      return needsReview(classification, extraction, timingMs);
    }
    return { status: "extracted", classification, extraction, timingMs };
  }

  private async readDocument(documentId: string): Promise<LlmDocument> {
    const [row] = await this.db
      .select({
        storageKey: documents.storageKey,
        mimeType: documents.mimeType,
      })
      .from(documents)
      .where(eq(documents.id, documentId));
    if (row === undefined) throw new Error("Không có document");

    const content = await this.storage.read(row.storageKey);
    if (content === null) throw new UnreadableFileError();
    return { documentId, mimeType: row.mimeType, content };
  }
}

function needsReview(
  classification: Classification | undefined,
  extraction: Extraction | undefined,
  timingMs: Record<string, number>,
): NeedsReviewResult {
  return {
    status: "needs_review",
    routing: route([]),
    ruleResults: [],
    timingMs,
    ...(classification === undefined ? {} : { classification }),
    ...(extraction === undefined ? {} : { extraction }),
  };
}

async function timed<T>(
  timingMs: Record<string, number>,
  step: string,
  run: () => Promise<T>,
): Promise<T> {
  const startedAt = performance.now();
  try {
    return await run();
  } finally {
    timingMs[step] = Math.round(performance.now() - startedAt);
  }
}

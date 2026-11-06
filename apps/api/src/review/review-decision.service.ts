import { Inject, Injectable } from "@nestjs/common";
import type {
  DecisionRequest,
  DecisionResponse,
  DocumentStatus,
  PreviewRequest,
  PreviewResponse,
  ReviewActionKind,
} from "@credflow/contracts";
import type { RulesConfigSet } from "@credflow/rules";
import { eq } from "drizzle-orm";
import { CLOCK, type Clock } from "../common/clock.js";
import { type Db, DB } from "../db/db.provider.js";
import { documents } from "../db/schema.js";
import {
  DocumentStatusConflictError,
  DocumentStatusService,
} from "../documents/document-status.service.js";
import { scoreDocument } from "../rules/rule-scorer.js";
import { RULES_CONFIG } from "../rules/rules-config.provider.js";
import { applyCorrections } from "./corrections.js";
import { ReviewActionsRepository } from "./review-actions.repository.js";
import { ReviewReadService } from "./review-read.service.js";

const STATUS_BY_ACTION: Record<ReviewActionKind, DocumentStatus> = {
  approve: "approved",
  reject: "rejected",
  request_reupload: "reupload_requested",
};

export class DocumentNotFoundError extends Error {
  constructor() {
    super("Không tìm thấy giấy");
    this.name = "DocumentNotFoundError";
  }
}

/** Giấy chưa có kết quả trích xuất thì không có gì để chấm lại. Controller trả 409. */
export class NothingToPreviewError extends Error {
  constructor() {
    super("Giấy chưa có kết quả trích xuất để chấm lại");
    this.name = "NothingToPreviewError";
  }
}

@Injectable()
export class ReviewDecisionService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(RULES_CONFIG) private readonly configs: RulesConfigSet,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly status: DocumentStatusService,
    private readonly actions: ReviewActionsRepository,
    private readonly read: ReviewReadService,
  ) {}

  /**
   * Người duyệt ra quyết định. Một transaction: đổi trạng thái (khoá `version`) rồi ghi `review_actions`;
   * lỗi ở bước nào thì rollback cả hai. `version` lệch hoặc giấy không còn `needs_review` →
   * `DocumentStatusConflictError` (controller trả 409). Corrections chỉ lưu ở `review_actions`,
   * `documents.extraction` giữ nguyên output LLM cho eval (Liam 2026-11-06).
   */
  async decide(
    documentId: string,
    reviewerId: string,
    req: DecisionRequest,
  ): Promise<DecisionResponse> {
    const [doc] = await this.db
      .select({
        extraction: documents.extraction,
        status: documents.status,
        version: documents.version,
      })
      .from(documents)
      .where(eq(documents.id, documentId));
    if (doc === undefined) throw new DocumentNotFoundError();
    // Báo 409 trước khi kiểm corrections: bản client đã thấy là cũ thì `before` lệch là chuyện
    // đương nhiên, 400 lúc đó gây hiểu nhầm. Đây chỉ là báo sớm; khoá thật là UPDATE bên dưới.
    if (doc.status !== "needs_review" || doc.version !== req.version) {
      throw new DocumentStatusConflictError(
        documentId,
        "needs_review",
        STATUS_BY_ACTION[req.action],
      );
    }

    // Kiểm và chuẩn hoá trước khi mở transaction. `before` lấy từ extraction đọc ở trên; nếu
    // extraction đổi sau lần đọc này thì `version` cũng đã đổi, UPDATE dưới đây ra 409.
    const { corrections } = applyCorrections(
      doc.extraction ?? undefined,
      req.corrections,
    );

    const reviewAction = await this.db.transaction(async (tx) => {
      await this.status.transition(
        documentId,
        "needs_review",
        STATUS_BY_ACTION[req.action],
        {},
        { reviewerId },
        { tx, expectedVersion: req.version },
      );
      return this.actions.insert(tx, {
        documentId,
        reviewerId,
        action: req.action,
        corrections,
        note: req.note,
      });
    });

    const found = await this.read.findDocument(documentId);
    if (found === undefined) throw new DocumentNotFoundError();
    return { document: found.document, reviewAction };
  }

  /**
   * Chấm lại rule trên extraction gốc + corrections, với `asOf` đã lưu (ADR 0010) để so được với
   * kết quả gốc. Không ghi DB.
   */
  async preview(
    documentId: string,
    req: PreviewRequest,
  ): Promise<PreviewResponse> {
    const [doc] = await this.db
      .select({
        staffId: documents.staffId,
        declaredDocType: documents.declaredDocType,
        classification: documents.classification,
        extraction: documents.extraction,
        asOf: documents.asOf,
      })
      .from(documents)
      .where(eq(documents.id, documentId));
    if (doc === undefined) throw new DocumentNotFoundError();
    if (doc.classification === null || doc.extraction === null) {
      throw new NothingToPreviewError();
    }

    const { extraction } = applyCorrections(doc.extraction, req.corrections);
    if (extraction === undefined) throw new NothingToPreviewError();
    const asOf = doc.asOf ?? this.clock.todayUtc();
    const { ruleResults, routing } = await scoreDocument(
      this.db,
      this.configs,
      {
        documentId,
        staffId: doc.staffId,
        extraction,
        classification: doc.classification,
        declaredDocType: doc.declaredDocType ?? undefined,
        asOf,
      },
    );
    return { asOf, ruleResults, routing };
  }
}

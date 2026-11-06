import { Inject, Injectable } from "@nestjs/common";
import { type Correction, ReviewAction } from "@credflow/contracts";
import { asc, eq } from "drizzle-orm";
import { ulid } from "ulid";
import { type Db, DB } from "../db/db.provider.js";
import { reviewActions } from "../db/schema.js";
import type { Tx } from "../documents/document-status.service.js";

export interface NewReviewAction {
  documentId: string;
  reviewerId: string;
  action: ReviewAction["action"];
  corrections: Correction[];
  note?: string | undefined;
}

/**
 * `review_actions` chỉ insert (plan 27): lịch sử duyệt là dữ liệu audit và eval.
 * Không có hàm update/delete, và không được thêm.
 */
@Injectable()
export class ReviewActionsRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** Ghi trong transaction của caller, cùng lúc với đổi trạng thái document. */
  async insert(tx: Db | Tx, action: NewReviewAction): Promise<ReviewAction> {
    const [row] = await tx
      .insert(reviewActions)
      .values({
        id: ulid(),
        documentId: action.documentId,
        reviewerId: action.reviewerId,
        action: action.action,
        corrections: action.corrections,
        note: action.note ?? null,
      })
      .returning();
    if (row === undefined)
      throw new Error("Insert review_actions không trả dòng");
    return toReviewAction(row);
  }

  /** Lịch sử duyệt của một giấy, cũ trước. */
  async listForDocument(documentId: string): Promise<ReviewAction[]> {
    const rows = await this.db
      .select()
      .from(reviewActions)
      .where(eq(reviewActions.documentId, documentId))
      .orderBy(asc(reviewActions.createdAt), asc(reviewActions.id));
    return rows.map(toReviewAction);
  }
}

function toReviewAction(row: typeof reviewActions.$inferSelect): ReviewAction {
  return ReviewAction.parse({
    ...row,
    note: row.note ?? undefined,
    createdAt: row.createdAt.toISOString(),
  });
}

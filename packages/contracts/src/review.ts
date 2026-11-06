import * as z from "zod";
import { Id, IsoDate, IsoTimestamp } from "./common.js";
import { DocType } from "./document.js";
import { RuleCode, RuleResult } from "./rules.js";
import {
  Correction,
  DocumentView,
  ReviewAction,
  ReviewActionKind,
  RoutingDecision,
} from "./routing.js";

// Plan 27 (P4): API duyệt. Liam duyệt 2026-11-06.

/** Cách sắp hàng chờ: `due` = hạn gần nhất trước (không có hạn xuống cuối), `submitted` = nộp sớm nhất trước. */
export const ReviewQueueSort = z
  .enum(["due", "submitted"])
  .meta({ id: "ReviewQueueSort" });
export type ReviewQueueSort = z.infer<typeof ReviewQueueSort>;

export const REVIEW_QUEUE_MAX_LIMIT = 100;

/** Query GET /review/queue. Giá trị query là chuỗi nên `limit` dùng coerce. */
export const ReviewQueueQuery = z
  .strictObject({
    reason: RuleCode.optional(),
    sort: ReviewQueueSort.default("due"),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(REVIEW_QUEUE_MAX_LIMIT)
      .default(20),
    /** `nextCursor` của trang trước, giữ nguyên `sort` và `reason`. */
    cursor: z.string().min(1).optional(),
  })
  .meta({ id: "ReviewQueueQuery" });
export type ReviewQueueQuery = z.infer<typeof ReviewQueueQuery>;

/** Một dòng hàng chờ, đủ để người duyệt chọn ca; chi tiết lấy ở GET /review/documents/:id. */
export const ReviewQueueItem = z
  .object({
    id: Id,
    staffId: Id,
    staffName: z.string(),
    fileName: z.string(),
    /** Null khi ca vào hàng chờ trước lúc phân loại xong (vd sweep, lỗi LLM). */
    docType: DocType.nullable(),
    reasons: z.array(RuleCode),
    /** `expirationDate` đã trích xuất; null nếu không có. */
    dueDate: IsoDate.nullable(),
    createdAt: IsoTimestamp,
    version: z.number().int().min(1),
  })
  .meta({ id: "ReviewQueueItem" });
export type ReviewQueueItem = z.infer<typeof ReviewQueueItem>;

export const ReviewQueuePage = z
  .object({
    items: z.array(ReviewQueueItem),
    /** Null = hết hàng chờ. */
    nextCursor: z.string().nullable(),
  })
  .meta({ id: "ReviewQueuePage" });
export type ReviewQueuePage = z.infer<typeof ReviewQueuePage>;

/** Response GET /review/documents/:id. `reviewActions` cũ trước. */
export const ReviewDocumentDetail = z
  .object({
    document: DocumentView,
    staff: z.object({
      id: Id,
      legalName: z.string(),
      clientIds: z.array(Id),
    }),
    reviewActions: z.array(ReviewAction),
  })
  .meta({ id: "ReviewDocumentDetail" });
export type ReviewDocumentDetail = z.infer<typeof ReviewDocumentDetail>;

/** Body POST /review/documents/:id/preview: thử sửa, không ghi gì. */
export const PreviewRequest = z
  .strictObject({ corrections: z.array(Correction).default([]) })
  .meta({ id: "PreviewRequest" });
export type PreviewRequest = z.infer<typeof PreviewRequest>;

export const PreviewResponse = z
  .object({
    /** Ngày đã dùng để chấm: `asOf` lưu lúc chấm gốc (ADR 0010). */
    asOf: IsoDate,
    ruleResults: z.array(RuleResult),
    routing: RoutingDecision,
  })
  .meta({ id: "PreviewResponse" });
export type PreviewResponse = z.infer<typeof PreviewResponse>;

/** Hành động cần lý do: từ chối và yêu cầu nộp lại (Liam 2026-11-06). */
const NOTE_REQUIRED: readonly ReviewActionKind[] = [
  "reject",
  "request_reupload",
];

/**
 * Body POST /review/documents/:id/decision. `version` là `document.version` người duyệt đã thấy.
 * `before` của correction phải khớp giá trị gốc; server kiểm lại.
 */
export const DecisionRequest = z
  .strictObject({
    action: ReviewActionKind,
    version: z.number().int().min(1),
    corrections: z.array(Correction).default([]),
    note: z.string().optional(),
  })
  .superRefine((req, ctx) => {
    if (
      NOTE_REQUIRED.includes(req.action) &&
      (req.note === undefined || req.note.trim() === "")
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["note"],
        message: "Từ chối hoặc yêu cầu nộp lại phải có lý do",
      });
    }
  })
  .meta({ id: "DecisionRequest" });
export type DecisionRequest = z.infer<typeof DecisionRequest>;

export const DecisionResponse = z
  .object({ document: DocumentView, reviewAction: ReviewAction })
  .meta({ id: "DecisionResponse" });
export type DecisionResponse = z.infer<typeof DecisionResponse>;

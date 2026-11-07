import * as z from "zod";
import { Id, IsoDate, IsoTimestamp } from "./common.js";
import { Classification, DocType } from "./document.js";
import { Extraction } from "./extraction.js";
import { RuleCode, RuleResult } from "./rules.js";

// Đã chốt 2026-11-03 (plan 07).

/**
 * Chỉ hai nhánh. Hệ thống không bao giờ tự từ chối: ca không qua rule
 * (kể cả chắc chắn hết hạn) cũng chuyển cho người duyệt (docs/product.md mục 8).
 */
export const RoutingDecision = z
  .object({
    decision: z.enum(["auto_approve", "needs_review"]),
    /** Các rule `block` không qua. Rỗng khi auto_approve. */
    reasons: z.array(RuleCode),
  })
  .meta({ id: "RoutingDecision" });
export type RoutingDecision = z.infer<typeof RoutingDecision>;

export const DocumentStatus = z
  .enum([
    "uploaded",
    "processing",
    /** LLM đã phân loại và trích xuất xong, chưa chạy rule. */
    "extracted",
    "auto_approved",
    "needs_review",
    "approved",
    "rejected",
    "reupload_requested",
    "failed",
  ])
  .meta({ id: "DocumentStatus" });
export type DocumentStatus = z.infer<typeof DocumentStatus>;

/** Phiên bản của mọi thứ ảnh hưởng tới kết quả, để eval và audit tái lập được. */
export const Versions = z
  .object({
    pipeline: z.string(),
    prompt: z.string(),
    model: z.string(),
    rules: z.string(),
  })
  .meta({ id: "Versions" });
export type Versions = z.infer<typeof Versions>;

export const DocumentRecord = z
  .object({
    id: Id,
    staffId: Id,
    fileName: z.string(),
    mimeType: z.string(),
    sizeBytes: z.number().int().positive(),
    /** sha256 hex chữ thường của nội dung file, dùng để dedupe upload. */
    checksum: z.string().regex(/^[0-9a-f]{64}$/),
    /** Vị trí file trong storage (local hoặc S3), tách khỏi tên file người dùng đặt. */
    storageKey: z.string().min(1),
    /** Loại giấy nhân viên chọn lúc upload (có thể sai). */
    declaredDocType: DocType.optional(),
    status: DocumentStatus,
    /**
     * Optimistic lock (plan 27): tăng 1 mỗi lần đổi trạng thái. Người duyệt gửi lại `version` đã thấy;
     * lệch thì 409, không ghi đè thay đổi của người khác hay của worker.
     */
    version: z.number().int().min(1),
    classification: Classification.optional(),
    extraction: Extraction.optional(),
    ruleResults: z.array(RuleResult).default([]),
    routing: RoutingDecision.optional(),
    versions: Versions.optional(),
    /** "Hôm nay" (ngày UTC) lúc chấm rule, để chạy lại rule ra đúng kết quả cũ (ADR 0010). */
    asOf: IsoDate.optional(),
    timingMs: z.record(z.string(), z.number().min(0)).default({}),
    error: z.object({ step: z.string(), message: z.string() }).optional(),
    createdAt: IsoTimestamp,
    updatedAt: IsoTimestamp,
  })
  .meta({ id: "DocumentRecord" });
export type DocumentRecord = z.infer<typeof DocumentRecord>;

export const ReviewActionKind = z
  .enum(["approve", "reject", "request_reupload"])
  .meta({ id: "ReviewActionKind" });
export type ReviewActionKind = z.infer<typeof ReviewActionKind>;

/**
 * Quyết định gần nhất của người duyệt, cho staff thấy lý do (plan 28). Không có `reviewerId`,
 * `corrections`: ai duyệt và sửa gì là dữ liệu audit, chỉ người duyệt xem.
 */
export const ReviewSummary = z
  .object({
    action: ReviewActionKind,
    note: z.string().optional(),
    decidedAt: IsoTimestamp,
  })
  .meta({ id: "ReviewSummary" });
export type ReviewSummary = z.infer<typeof ReviewSummary>;

/**
 * Một giấy như staff thấy qua API đọc (plan 17). Bỏ `storageKey`, `checksum`: chi tiết lưu trữ nội bộ.
 * Zod bỏ key lạ khi parse, nên parse một dòng DB đầy đủ cũng không lộ hai trường này.
 * `lastReview` (plan 28): vắng khi chưa có người duyệt.
 */
export const DocumentView = DocumentRecord.omit({
  storageKey: true,
  checksum: true,
})
  .extend({ lastReview: ReviewSummary.optional() })
  .meta({ id: "DocumentView" });
export type DocumentView = z.infer<typeof DocumentView>;

/** Response GET /documents: giấy của staff đang đăng nhập, mới nhất trước. */
export const DocumentList = z
  .object({ items: z.array(DocumentView) })
  .meta({ id: "DocumentList" });
export type DocumentList = z.infer<typeof DocumentList>;

/**
 * Response POST /documents. HTTP 201 = tạo mới; 200 + `duplicate: true` = chính staff này
 * đã nộp đúng file này rồi (cùng sha256), trả lại document cũ.
 */
export const UploadDocumentResponse = z
  .object({ documentId: Id, status: DocumentStatus, duplicate: z.boolean() })
  .meta({ id: "UploadDocumentResponse" });
export type UploadDocumentResponse = z.infer<typeof UploadDocumentResponse>;

/**
 * Một chỗ người duyệt sửa. `fieldPath` dạng `fields.<tên>.value` (vd `fields.expirationDate.value`).
 * Tách riêng ở plan 27, hình dạng giữ nguyên như plan 07.
 */
export const Correction = z
  .object({
    fieldPath: z.string(),
    before: z.string().nullable(),
    after: z.string().nullable(),
  })
  .meta({ id: "Correction" });
export type Correction = z.infer<typeof Correction>;

/** Hành động của người duyệt. Mọi chỗ sửa được lưu lại làm dữ liệu eval. */
export const ReviewAction = z
  .object({
    id: Id,
    documentId: Id,
    reviewerId: Id,
    action: ReviewActionKind,
    corrections: z.array(Correction).default([]),
    note: z.string().optional(),
    createdAt: IsoTimestamp,
  })
  .meta({ id: "ReviewAction" });
export type ReviewAction = z.infer<typeof ReviewAction>;

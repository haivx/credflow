import * as z from "zod";
import { Id, IsoTimestamp } from "./common.js";
import { Classification, DocType } from "./document.js";
import { Extraction } from "./extraction.js";
import { RuleCode, RuleResult } from "./rules.js";

// BẢN NHÁP: Liam chốt ở P0.

/**
 * Chỉ hai nhánh. Hệ thống không bao giờ tự từ chối: ca không qua rule
 * cũng chuyển cho người duyệt (quyết định còn mở, docs/product.md mục 8).
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
    "auto_approved",
    "needs_review",
    "approved",
    "rejected",
    "reupload_requested",
    "failed",
  ])
  .meta({ id: "DocumentStatus" });

/** Phiên bản của mọi thứ ảnh hưởng tới kết quả, để eval và audit tái lập được. */
export const Versions = z
  .object({
    pipeline: z.string(),
    prompt: z.string(),
    model: z.string(),
    rules: z.string(),
  })
  .meta({ id: "Versions" });

export const DocumentRecord = z
  .object({
    id: Id,
    staffId: Id,
    fileName: z.string(),
    mimeType: z.string(),
    /** Loại giấy nhân viên chọn lúc upload (có thể sai). */
    declaredDocType: DocType.optional(),
    status: DocumentStatus,
    classification: Classification.optional(),
    extraction: Extraction.optional(),
    ruleResults: z.array(RuleResult).default([]),
    routing: RoutingDecision.optional(),
    versions: Versions.optional(),
    timingMs: z.record(z.string(), z.number().min(0)).default({}),
    error: z.object({ step: z.string(), message: z.string() }).optional(),
    createdAt: IsoTimestamp,
  })
  .meta({ id: "DocumentRecord" });
export type DocumentRecord = z.infer<typeof DocumentRecord>;

/** Hành động của người duyệt. Mọi chỗ sửa được lưu lại làm dữ liệu eval. */
export const ReviewAction = z
  .object({
    documentId: Id,
    reviewerId: Id,
    action: z.enum(["approve", "reject", "request_reupload"]),
    corrections: z
      .array(
        z.object({
          fieldPath: z.string(),
          before: z.string().nullable(),
          after: z.string().nullable(),
        }),
      )
      .default([]),
    note: z.string().optional(),
    createdAt: IsoTimestamp,
  })
  .meta({ id: "ReviewAction" });
export type ReviewAction = z.infer<typeof ReviewAction>;

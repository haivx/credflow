import * as z from "zod";
import { Confidence } from "./common.js";

// Đã chốt 2026-11-03 (plan 07).

/** 5 loại giấy của MVP (docs/doc-types.md). `unknown` = không nhận ra hoặc upload nhầm. */
export const DocType = z
  .enum([
    "cpr_card",
    "professional_license",
    "tb_test",
    "background_check",
    "vaccination_record",
    "unknown",
  ])
  .meta({ id: "DocType" });
export type DocType = z.infer<typeof DocType>;

/** Vùng trên trang, toạ độ chuẩn hoá 0..1 so với kích thước trang. */
export const BoundingBox = z
  .object({
    page: z.number().int().min(0),
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    w: z.number().min(0).max(1),
    h: z.number().min(0).max(1),
  })
  .meta({ id: "BoundingBox" });

/** Bằng chứng cho một trường: đoạn chữ gốc trên giấy, và vị trí nếu có. */
export const Evidence = z
  .object({
    quote: z.string().min(1),
    box: BoundingBox.optional(),
  })
  .meta({ id: "Evidence" });

/**
 * Một trường đã trích xuất. `value` null = không tìm thấy trên giấy.
 * Nguyên tắc: có value thì phải có evidence (kiểm tra ở packages/rules, không ở schema).
 */
export function extractedField<T extends z.ZodType>(value: T) {
  return z.object({
    value: value.nullable(),
    confidence: Confidence,
    evidence: Evidence.nullable(),
  });
}

export const Classification = z
  .object({
    docType: DocType,
    confidence: Confidence,
  })
  .meta({ id: "Classification" });
export type Classification = z.infer<typeof Classification>;

/** Field text đi kèm file trong multipart POST /documents. `staffId` không có ở đây: API lấy từ session. */
export const UploadDocumentFields = z
  .strictObject({ declaredDocType: DocType.optional() })
  .meta({ id: "UploadDocumentFields" });
export type UploadDocumentFields = z.infer<typeof UploadDocumentFields>;

import * as z from "zod";

// KB8 plan 12f: PR thử, KHÔNG MERGE.
// Đã chốt 2026-11-03 (plan 07). Primitive dùng chung, không có .meta({ id }).

/** Ngày lịch dạng YYYY-MM-DD (không có giờ, không có múi giờ). */
export const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Timestamp ISO-8601. */
export const IsoTimestamp = z.string();

/** Độ tự tin 0..1. Không phải xác suất đã hiệu chỉnh: chỉ dùng để phân luồng. */
export const Confidence = z.number().min(0).max(1);

/** Định danh dạng chuỗi (ulid). */
export const Id = z.string().min(1);

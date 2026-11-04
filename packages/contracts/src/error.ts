import * as z from "zod";

// Đã chốt 2026-11-03 (plan 08; UNAUTHORIZED, FORBIDDEN thêm ở plan 10; PAYLOAD_TOO_LARGE, UNSUPPORTED_MEDIA_TYPE ở plan 11). Format lỗi duy nhất của API.

/** Mã lỗi ổn định cho client. HTTP status do API map từ mã này. */
export const ErrorCode = z.enum([
  "VALIDATION_FAILED",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  /** 413: file vượt giới hạn dung lượng upload. */
  "PAYLOAD_TOO_LARGE",
  /** 415: nội dung file không phải PDF/PNG/JPEG (nhận dạng bằng magic bytes, không tin mimeType client gửi). */
  "UNSUPPORTED_MEDIA_TYPE",
  "INTERNAL",
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

export const ApiError = z
  .object({
    code: ErrorCode,
    message: z.string(),
    /** VALIDATION_FAILED: danh sách issue (path, message). Mã khác: thường không có. */
    details: z.unknown().optional(),
  })
  .meta({ id: "ApiError" });
export type ApiError = z.infer<typeof ApiError>;

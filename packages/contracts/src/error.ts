import * as z from "zod";

// Đã chốt 2026-11-03 (plan 08; UNAUTHORIZED, FORBIDDEN thêm ở plan 10). Format lỗi duy nhất của API.

/** Mã lỗi ổn định cho client. HTTP status do API map từ mã này. */
export const ErrorCode = z.enum([
  "VALIDATION_FAILED",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
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

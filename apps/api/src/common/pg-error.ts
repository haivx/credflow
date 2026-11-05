import { DrizzleQueryError } from "drizzle-orm";
import * as z from "zod";

const SafeString = z.string().optional().catch(undefined);

/**
 * Phần của lỗi pg an toàn để log. z.object bỏ field lạ, nên `detail` và `where` (chứa giá trị
 * của dòng) không bao giờ đi qua. Field phụ sai kiểu thì bỏ, vẫn giữ `code`.
 */
const PgErrorInfo = z.object({
  code: z.string().regex(/^[0-9A-Z]{5}$/),
  constraint: SafeString,
  table: SafeString,
  column: SafeString,
});
export type PgErrorInfo = z.infer<typeof PgErrorInfo>;

const CauseWithCode = z.object({ code: z.string() });

/** Lấy phần an toàn của lỗi pg (Drizzle bọc lỗi pg ở `.cause`). Không phải lỗi pg thì trả undefined. */
export function getPgErrorInfo(error: unknown): PgErrorInfo | undefined {
  const candidate =
    typeof error === "object" && error !== null && "cause" in error
      ? error.cause
      : error;
  return PgErrorInfo.safeParse(candidate).data;
}

/** Mã SQLSTATE của Postgres từ lỗi. Không phải lỗi pg thì trả undefined. */
export function getPgErrorCode(error: unknown): string | undefined {
  return getPgErrorInfo(error)?.code;
}

/** Stack không có phần đầu `name: message`. Không tìm thấy message thì bỏ cả stack: thà mất frame còn hơn lộ giá trị. */
function framesOnly(error: Error): string | undefined {
  const { stack, message } = error;
  if (stack === undefined) return undefined;
  const start = stack.indexOf(message);
  return start === -1
    ? undefined
    : stack.slice(start + message.length).trimStart();
}

/**
 * Chuỗi được phép log cho một lỗi (A14). Lỗi DB chỉ gồm PgErrorInfo + SQL dạng $1 + frame.
 * Message gốc của Drizzle chứa `params`, message của pg có thể chứa giá trị của dòng.
 * SQL an toàn vì giá trị luôn đi qua tham số (lint cấm sql.raw ở apps/api/src).
 */
export function formatErrorForLog(error: unknown): {
  message: string;
  stack?: string;
} {
  if (!(error instanceof Error)) {
    return { message: "Unhandled exception", stack: String(error) };
  }

  const pg = getPgErrorInfo(error);
  const isQueryError = error instanceof DrizzleQueryError;
  if (pg === undefined && !isQueryError) {
    return { message: "Unhandled exception", stack: error.stack };
  }

  const parts = ["DB query failed"];
  if (pg !== undefined) parts.push(`pg=${JSON.stringify(pg)}`);
  if (isQueryError) {
    // Mất kết nối không có SQLSTATE; mã như ECONNREFUSED không chứa dữ liệu.
    const causeCode = CauseWithCode.safeParse(error.cause).data?.code;
    if (pg === undefined && causeCode !== undefined) {
      parts.push(`causeCode=${causeCode}`);
    }
    parts.push(`query=${error.query}`);
  }
  return { message: parts.join(" "), stack: framesOnly(error) };
}

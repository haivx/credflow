import { DrizzleQueryError } from "drizzle-orm";

const SQLSTATE = /^[0-9A-Z]{5}$/;

/** Lấy mã SQLSTATE của Postgres từ lỗi (Drizzle bọc lỗi pg ở `.cause`). Không phải lỗi pg thì trả undefined. */
export function getPgErrorCode(error: unknown): string | undefined {
  const candidate =
    typeof error === "object" && error !== null && "cause" in error
      ? (error as { cause?: unknown }).cause
      : error;
  if (
    typeof candidate === "object" &&
    candidate !== null &&
    "code" in candidate &&
    typeof candidate.code === "string" &&
    SQLSTATE.test(candidate.code)
  ) {
    return candidate.code;
  }
  return undefined;
}

/** Phần của lỗi pg an toàn để log. Cố ý bỏ `detail` và `where`: chúng chứa giá trị của dòng. */
export interface PgErrorInfo {
  code: string;
  constraint?: string;
  table?: string;
  column?: string;
}

export function getPgErrorInfo(error: unknown): PgErrorInfo | undefined {
  const code = getPgErrorCode(error);
  if (code === undefined) return undefined;
  const cause =
    typeof error === "object" && error !== null && "cause" in error
      ? (error as { cause?: unknown }).cause
      : error;
  const source = (
    typeof cause === "object" && cause !== null ? cause : {}
  ) as Record<string, unknown>;
  const info: PgErrorInfo = { code };
  for (const key of ["constraint", "table", "column"] as const) {
    const value = source[key];
    if (typeof value === "string") info[key] = value;
  }
  return info;
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
    const causeCode = (error.cause as { code?: unknown } | undefined)?.code;
    if (pg === undefined && typeof causeCode === "string") {
      parts.push(`causeCode=${causeCode}`);
    }
    parts.push(`query=${error.query}`);
  }
  return { message: parts.join(" "), stack: framesOnly(error) };
}

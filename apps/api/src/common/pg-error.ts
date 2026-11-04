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

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

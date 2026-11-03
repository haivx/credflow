import { createHash, randomBytes } from "node:crypto";
import type { Request } from "express";

export const SESSION_COOKIE = "credflow_session";

/** Token 256 bit ngẫu nhiên, chỉ trình duyệt giữ bản thô (trong cookie). */
export function newSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * DB chỉ lưu sha256 của token. Khác mật khẩu, token đã đủ ngẫu nhiên (256 bit) nên không đoán được,
 * không cần salt hay hàm hash chậm.
 */
export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Đọc token từ cookie (cookie-parser đã parse vào req.cookies). Không có hoặc rỗng → undefined. */
export function readSessionToken(req: Request): string | undefined {
  // @types/cookie-parser khai báo req.cookies là any: gán sang unknown rồi thu hẹp kiểu.
  const cookies: unknown = req.cookies;
  if (typeof cookies !== "object" || cookies === null) return undefined;
  const value = (cookies as Record<string, unknown>)[SESSION_COOKIE];
  return typeof value === "string" && value !== "" ? value : undefined;
}

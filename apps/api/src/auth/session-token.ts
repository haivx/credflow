import { createHash, randomBytes } from "node:crypto";
import type { Request } from "express";
import * as z from "zod";

export const SESSION_COOKIE = "credflow_session";

const SessionCookies = z.object({ [SESSION_COOKIE]: z.string().min(1) });

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
  // @types/cookie-parser khai báo req.cookies là any; đây là dữ liệu từ client nên parse bằng Zod.
  return SessionCookies.safeParse(req.cookies).data?.[SESSION_COOKIE];
}

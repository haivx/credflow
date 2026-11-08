import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { parseJson } from "@credflow/contracts";
import * as z from "zod";

/**
 * Một lượt đăng nhập Google (plan 36, ADR 0015).
 * - `state`: chống CSRF đăng nhập. Google trả lại nguyên giá trị; callback so với cookie, khớp mới
 *   tin rằng chính trình duyệt này bắt đầu lượt đăng nhập.
 * - PKCE: chỉ `codeChallenge` = sha256(verifier) đi sang Google. Lúc đổi `code` lấy token phải đưa
 *   `codeVerifier`, nên ai chặn được `code` trên URL cũng không dùng được.
 * Cả hai nằm trong cookie `httpOnly` ký HMAC: server không cần lưu gì, cookie sửa tay thì bị từ chối.
 */
export const OAUTH_COOKIE = "credflow_oauth";
export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

export interface OAuthAttempt {
  state: string;
  codeVerifier: string;
  codeChallenge: string;
}

const Payload = z.strictObject({
  state: z.string().min(1),
  codeVerifier: z.string().min(43),
  exp: z.number().int(),
});

export function newOAuthAttempt(): OAuthAttempt {
  const codeVerifier = randomBytes(32).toString("base64url");
  return {
    state: randomBytes(16).toString("base64url"),
    codeVerifier,
    codeChallenge: createHash("sha256")
      .update(codeVerifier)
      .digest("base64url"),
  };
}

function sign(data: string, secret: string): string {
  return createHmac("sha256", secret).update(data).digest("base64url");
}

/** Giá trị cookie: `<base64url(JSON)>.<hmac>`. */
export function signOAuthCookie(
  attempt: OAuthAttempt,
  secret: string,
  nowMs: number,
): string {
  const data = Buffer.from(
    JSON.stringify({
      state: attempt.state,
      codeVerifier: attempt.codeVerifier,
      exp: nowMs + OAUTH_STATE_TTL_MS,
    }),
  ).toString("base64url");
  return `${data}.${sign(data, secret)}`;
}

/** Sai chữ ký, hết hạn, sai định dạng hoặc không có cookie → null. */
export function readOAuthCookie(
  value: string | undefined,
  secret: string,
  nowMs: number,
): { state: string; codeVerifier: string } | null {
  if (value === undefined) return null;
  const [data, sig, ...rest] = value.split(".");
  if (data === undefined || sig === undefined || rest.length > 0) return null;
  const expected = Buffer.from(sign(data, secret));
  const given = Buffer.from(sig);
  // So sánh thời gian hằng: không lộ chữ ký đúng tới ký tự thứ mấy.
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    return null;
  }
  let payload: z.output<typeof Payload>;
  try {
    payload = parseJson(
      Payload,
      Buffer.from(data, "base64url").toString("utf8"),
    );
  } catch {
    return null;
  }
  if (payload.exp < nowMs) return null;
  return { state: payload.state, codeVerifier: payload.codeVerifier };
}

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  newOAuthAttempt,
  OAUTH_STATE_TTL_MS,
  readOAuthCookie,
  signOAuthCookie,
} from "./oauth-state.js";

const SECRET = "k".repeat(32);
const NOW = 1_800_000_000_000;

describe("oauth-state (plan 36)", () => {
  it("PKCE: challenge = base64url(sha256(verifier)); mỗi lần ra state khác", () => {
    const a = newOAuthAttempt();
    const b = newOAuthAttempt();
    expect(a.codeChallenge).toBe(
      createHash("sha256").update(a.codeVerifier).digest("base64url"),
    );
    expect(a.codeVerifier.length).toBeGreaterThanOrEqual(43);
    expect(a.state).not.toBe(b.state);
  });

  it("ký rồi đọc lại → đúng state và verifier", () => {
    const attempt = newOAuthAttempt();
    const cookie = signOAuthCookie(attempt, SECRET, NOW);
    expect(readOAuthCookie(cookie, SECRET, NOW + 1000)).toEqual({
      state: attempt.state,
      codeVerifier: attempt.codeVerifier,
    });
  });

  it("hết hạn sau 10 phút → null", () => {
    const cookie = signOAuthCookie(newOAuthAttempt(), SECRET, NOW);
    expect(readOAuthCookie(cookie, SECRET, NOW + OAUTH_STATE_TTL_MS + 1)).toBe(
      null,
    );
  });

  it("sửa 1 ký tự phần dữ liệu, sai khoá, sai định dạng → null", () => {
    const cookie = signOAuthCookie(newOAuthAttempt(), SECRET, NOW);
    const [data = "", sig = ""] = cookie.split(".");
    const flipped = (data[0] === "A" ? "B" : "A") + data.slice(1);
    expect(readOAuthCookie(`${flipped}.${sig}`, SECRET, NOW)).toBe(null);
    expect(readOAuthCookie(cookie, "x".repeat(32), NOW)).toBe(null);
    expect(readOAuthCookie("khong-co-cham", SECRET, NOW)).toBe(null);
    expect(readOAuthCookie(undefined, SECRET, NOW)).toBe(null);
  });
});

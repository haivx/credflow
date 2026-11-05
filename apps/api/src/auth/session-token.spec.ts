import type { Request } from "express";
import { describe, expect, it } from "vitest";
import {
  hashSessionToken,
  newSessionToken,
  readSessionToken,
  SESSION_COOKIE,
} from "./session-token.js";

describe("session token", () => {
  it("token là 32 byte base64url (43 ký tự), mỗi lần một token khác", () => {
    const a = newSessionToken();

    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(newSessionToken()).not.toBe(a);
  });

  it("hash là sha256 hex 64 ký tự, cùng token ra cùng hash", () => {
    const token = newSessionToken();

    expect(hashSessionToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashSessionToken(token)).toBe(hashSessionToken(token));
    expect(hashSessionToken(token)).not.toBe(token);
  });

  it.each([
    ["có cookie", { [SESSION_COOKIE]: "abc" }, "abc"],
    ["không có cookie", {}, undefined],
    ["cookie rỗng", { [SESSION_COOKIE]: "" }, undefined],
    ["cookie-parser chưa chạy", undefined, undefined],
    ["cookie không phải chuỗi", { [SESSION_COOKIE]: 123 }, undefined],
    ["req.cookies không phải object", "abc", undefined],
  ])("readSessionToken: %s", (_name, cookies, expected) => {
    expect(readSessionToken({ cookies } as unknown as Request)).toBe(expected);
  });
});

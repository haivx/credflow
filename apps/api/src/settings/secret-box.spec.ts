import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, parseMasterKey } from "./secret-box.js";

const key = randomBytes(32);
const SECRET = "sk-ant-api03-khoa-gia-cho-test-0123456789";

describe("secret-box (plan 35)", () => {
  it("khứ hồi: giải mã ra đúng chuỗi ban đầu; bản mã không chứa chuỗi gốc", () => {
    const token = encryptSecret(SECRET, key);
    expect(token.startsWith("v1:")).toBe(true);
    expect(token).not.toContain("sk-ant");
    expect(decryptSecret(token, key)).toBe(SECRET);
  });

  it("mỗi lần mã hoá ra chuỗi khác (IV ngẫu nhiên)", () => {
    expect(encryptSecret(SECRET, key)).not.toBe(encryptSecret(SECRET, key));
  });

  it("sửa 1 ký tự bản mã → lỗi (auth tag của GCM)", () => {
    const token = encryptSecret(SECRET, key);
    const [v, iv, tag, ct] = token.split(":");
    const flipped = (ct ?? "").startsWith("A")
      ? `B${(ct ?? "").slice(1)}`
      : `A${(ct ?? "").slice(1)}`;
    expect(() => decryptSecret([v, iv, tag, flipped].join(":"), key)).toThrow();
  });

  it("sai khoá chủ → lỗi", () => {
    const token = encryptSecret(SECRET, key);
    expect(() => decryptSecret(token, randomBytes(32))).toThrow();
  });

  it("định dạng lạ → lỗi", () => {
    expect(() => decryptSecret("khong-phai-ban-ma", key)).toThrow();
  });

  it("parseMasterKey: base64 đúng 32 byte; khác thì lỗi", () => {
    expect(parseMasterKey(key.toString("base64")).equals(key)).toBe(true);
    expect(() => parseMasterKey(randomBytes(16).toString("base64"))).toThrow(
      /32 byte/,
    );
  });
});

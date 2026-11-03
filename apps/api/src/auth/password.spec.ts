import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password.js";

describe("hashPassword / verifyPassword", () => {
  it("đúng mật khẩu thì true, sai thì false", async () => {
    const stored = await hashPassword("credflow-dev");

    expect(await verifyPassword("credflow-dev", stored)).toBe(true);
    expect(await verifyPassword("credflow-deV", stored)).toBe(false);
    expect(await verifyPassword("", stored)).toBe(false);
  });

  it("chuỗi lưu có format scrypt$N$r$p$salt$hash, không chứa mật khẩu thô", async () => {
    const stored = await hashPassword("credflow-dev");

    expect(stored).toMatch(
      /^scrypt\$16384\$8\$1\$[0-9a-f]{32}\$[0-9a-f]{128}$/,
    );
    expect(stored).not.toContain("credflow-dev");
  });

  it("cùng mật khẩu, hai lần hash ra hai chuỗi khác nhau (salt mới mỗi lần)", async () => {
    const a = await hashPassword("credflow-dev");
    const b = await hashPassword("credflow-dev");

    expect(a).not.toBe(b);
    expect(await verifyPassword("credflow-dev", a)).toBe(true);
    expect(await verifyPassword("credflow-dev", b)).toBe(true);
  });

  it.each([
    ["rỗng", ""],
    ["thuật toán khác", "bcrypt$10$abc"],
    ["thiếu phần", "scrypt$16384$8$1$abcd"],
    ["thừa phần", "scrypt$16384$8$1$abcd$abcd$x"],
    ["salt không phải hex", "scrypt$16384$8$1$zz$abcd"],
    ["N không phải luỹ thừa của 2", "scrypt$1000$8$1$abcd$abcd"],
    ["N không phải số", "scrypt$abc$8$1$abcd$abcd"],
  ])("chuỗi lưu hỏng (%s) thì false, không throw", async (_name, stored) => {
    expect(await verifyPassword("credflow-dev", stored)).toBe(false);
  });
});

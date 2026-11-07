import { describe, expect, it } from "vitest";
import { DEV_SEED_PASSWORD, resolveSeedPassword } from "./seed-password.js";

const LOCAL = "postgres://credflow:credflow@localhost:5432/credflow";
const REMOTE = "postgres://postgres:x@postgres.railway.internal:5432/railway";

describe("resolveSeedPassword (plan 33)", () => {
  it("database local, không đặt biến → mật khẩu dev như trước", () => {
    expect(resolveSeedPassword({ DATABASE_URL: LOCAL })).toBe(
      DEV_SEED_PASSWORD,
    );
    expect(
      resolveSeedPassword({
        DATABASE_URL: "postgres://u:p@127.0.0.1:5433/credflow_test",
      }),
    ).toBe(DEV_SEED_PASSWORD);
  });

  it("database không phải local, không đặt biến → lỗi nêu SEED_PASSWORD", () => {
    expect(() => resolveSeedPassword({ DATABASE_URL: REMOTE })).toThrow(
      /SEED_PASSWORD/,
    );
    expect(() =>
      resolveSeedPassword({ DATABASE_URL: REMOTE, SEED_PASSWORD: "" }),
    ).toThrow(/SEED_PASSWORD/);
  });

  it("database không phải local + mật khẩu dev → lỗi", () => {
    expect(() =>
      resolveSeedPassword({
        DATABASE_URL: REMOTE,
        SEED_PASSWORD: DEV_SEED_PASSWORD,
      }),
    ).toThrow(/credflow-dev/);
  });

  it("database không phải local + mật khẩu ngắn hơn 12 ký tự → lỗi", () => {
    expect(() =>
      resolveSeedPassword({ DATABASE_URL: REMOTE, SEED_PASSWORD: "ngan-qua" }),
    ).toThrow(/12/);
  });

  it("có biến hợp lệ → dùng biến (cả local lẫn không local)", () => {
    const pw = "mat-khau-demo-rieng-2026";
    expect(
      resolveSeedPassword({ DATABASE_URL: REMOTE, SEED_PASSWORD: pw }),
    ).toBe(pw);
    expect(
      resolveSeedPassword({ DATABASE_URL: LOCAL, SEED_PASSWORD: pw }),
    ).toBe(pw);
  });
});

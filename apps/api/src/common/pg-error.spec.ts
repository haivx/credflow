import { describe, expect, it } from "vitest";
import { getPgErrorCode } from "./pg-error.js";

/** Giả lập lỗi Postgres như Drizzle ném ra: lỗi của pg nằm ở `.cause`. */
function drizzleError(code: string): Error {
  const pgError = Object.assign(new Error("pg error"), { code });
  return new Error("Failed query: insert ...", { cause: pgError });
}

describe("getPgErrorCode", () => {
  it("lấy SQLSTATE từ error.cause.code", () => {
    expect(getPgErrorCode(drizzleError("23505"))).toBe("23505");
  });

  it("lỗi pg không bị bọc thì đọc thẳng error.code", () => {
    const pgError = Object.assign(new Error("pg error"), { code: "23503" });
    expect(getPgErrorCode(pgError)).toBe("23503");
  });

  it("lỗi thường không có code thì trả undefined", () => {
    expect(getPgErrorCode(new Error("boom"))).toBeUndefined();
  });

  it("không phải object thì trả undefined, không ném lỗi", () => {
    expect(getPgErrorCode("boom")).toBeUndefined();
    expect(getPgErrorCode(null)).toBeUndefined();
    expect(getPgErrorCode(undefined)).toBeUndefined();
  });

  it("code không phải SQLSTATE (vd lỗi mạng ECONNREFUSED) thì trả undefined", () => {
    const netError = Object.assign(new Error("connect"), {
      code: "ECONNREFUSED",
    });
    expect(getPgErrorCode(netError)).toBeUndefined();
  });
});

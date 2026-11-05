import { describe, expect, it } from "vitest";
import {
  formatErrorForLog,
  getPgErrorCode,
  getPgErrorInfo,
} from "./pg-error.js";

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

describe("getPgErrorInfo", () => {
  const withCause = (fields: object) =>
    new Error("Failed query", {
      cause: Object.assign(new Error("pg error"), { code: "23514", ...fields }),
    });

  it("lấy code, constraint, table, column; bỏ detail và where", () => {
    expect(
      getPgErrorInfo(
        withCause({
          constraint: "c",
          table: "t",
          column: "col",
          detail: "Failing row contains (SAMPLE)",
          where: "SAMPLE",
        }),
      ),
    ).toEqual({ code: "23514", constraint: "c", table: "t", column: "col" });
  });

  it("field không phải chuỗi thì bỏ, vẫn giữ code", () => {
    expect(getPgErrorInfo(withCause({ constraint: 1, table: null }))).toEqual({
      code: "23514",
    });
  });

  it("lỗi pg trần (không bọc): đọc trực tiếp", () => {
    const bare = Object.assign(new Error("x"), { code: "22P02" });
    expect(getPgErrorInfo(bare)).toEqual({ code: "22P02" });
  });

  it.each([
    ["không phải lỗi pg", new Error("boom")],
    ["cause không phải object", new Error("boom", { cause: "23514" })],
    [
      "code không phải SQLSTATE",
      Object.assign(new Error("x"), { code: "ECONNREFUSED" }),
    ],
    ["null", null],
    ["chuỗi", "23514"],
  ])("%s → undefined", (_name, error) => {
    expect(getPgErrorInfo(error)).toBeUndefined();
  });
});

describe("formatErrorForLog", () => {
  it("lỗi pg trong cause: không giữ message gốc", () => {
    const { message, stack } = formatErrorForLog(drizzleError("23514"));
    expect(message).toContain("23514");
    expect(message).not.toContain("Failed query");
    expect(stack ?? "").not.toContain("Failed query");
  });

  it("stack không chứa message (đã bị sửa): bỏ cả stack, không đoán", () => {
    const error = drizzleError("23514");
    error.stack = "Error: nội dung khác\n    at f (a.js:1:1)";
    expect(formatErrorForLog(error).stack).toBeUndefined();
  });

  it("lỗi không phải DB: giữ nguyên stack", () => {
    const error = new Error("boom");
    expect(formatErrorForLog(error)).toEqual({
      message: "Unhandled exception",
      stack: error.stack,
    });
  });

  it("giá trị không phải Error: in dạng chuỗi", () => {
    expect(formatErrorForLog("lạ")).toEqual({
      message: "Unhandled exception",
      stack: "lạ",
    });
  });
});

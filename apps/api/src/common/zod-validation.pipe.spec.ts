import { BadRequestException } from "@nestjs/common";
import { ApiError, StaffListQuery } from "@credflow/contracts";
import { describe, expect, it } from "vitest";
import { ZodValidationPipe } from "./zod-validation.pipe.js";

function catchError(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error("không ném lỗi");
}

describe("ZodValidationPipe", () => {
  const pipe = new ZodValidationPipe(StaffListQuery);

  it("input hợp lệ thì trả về dữ liệu đã parse", () => {
    expect(pipe.transform({ role: "nurse" })).toEqual({ role: "nurse" });
  });

  it("input sai thì ném BadRequestException, body đúng format ApiError", () => {
    const error = catchError(() => pipe.transform({ role: "" }));

    expect(error).toBeInstanceOf(BadRequestException);
    const body = ApiError.parse((error as BadRequestException).getResponse());
    expect(body.code).toBe("VALIDATION_FAILED");
    expect(body.details).toEqual([
      { path: ["role"], message: expect.any(String) as unknown },
    ]);
  });

  it("key lạ thì cũng là VALIDATION_FAILED", () => {
    const error = catchError(() => pipe.transform({ foo: "1" }));

    expect(error).toBeInstanceOf(BadRequestException);
    const body = ApiError.parse((error as BadRequestException).getResponse());
    expect(body.code).toBe("VALIDATION_FAILED");
  });
});

import {
  type ArgumentsHost,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
  UnauthorizedException,
  UnsupportedMediaTypeException,
} from "@nestjs/common";
import { ApiError, StaffProfile } from "@credflow/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AllExceptionsFilter } from "./all-exceptions.filter.js";

/** Giả lập lỗi Postgres như Drizzle ném ra: lỗi của pg nằm ở `.cause`. */
function drizzleError(code: string): Error {
  const pgError = Object.assign(new Error("pg error"), { code });
  return new Error("Failed query: insert into staff ...", { cause: pgError });
}

/** Chạy filter với một lỗi, trả về status và body client nhận được. */
function run(exception: unknown) {
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
  const host = {
    switchToHttp: () => ({ getResponse: () => res }),
  } as unknown as ArgumentsHost;

  new AllExceptionsFilter().catch(exception, host);

  const status = res.status.mock.calls[0]?.[0] as number;
  const body = ApiError.parse(res.json.mock.calls[0]?.[0]);
  return { status, body };
}

describe("AllExceptionsFilter", () => {
  let logError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logError = vi.spyOn(Logger.prototype, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("HttpException", () => {
    it("giữ nguyên body ApiError từ ZodValidationPipe", () => {
      const details = [{ path: ["role"], message: "Too small" }];
      const { status, body } = run(
        new BadRequestException({
          code: "VALIDATION_FAILED",
          message: "Validation failed",
          details,
        }),
      );

      expect(status).toBe(400);
      expect(body).toEqual({
        code: "VALIDATION_FAILED",
        message: "Validation failed",
        details,
      });
    });

    it("NotFoundException → 404 NOT_FOUND, giữ message", () => {
      const { status, body } = run(
        new NotFoundException("Không tìm thấy staff"),
      );

      expect(status).toBe(404);
      expect(body).toEqual({
        code: "NOT_FOUND",
        message: "Không tìm thấy staff",
      });
    });

    it("UnauthorizedException → 401 UNAUTHORIZED, ForbiddenException → 403 FORBIDDEN", () => {
      expect(run(new UnauthorizedException("Chưa đăng nhập"))).toEqual({
        status: 401,
        body: { code: "UNAUTHORIZED", message: "Chưa đăng nhập" },
      });
      expect(run(new ForbiddenException("Không có quyền"))).toEqual({
        status: 403,
        body: { code: "FORBIDDEN", message: "Không có quyền" },
      });
    });

    it("PayloadTooLargeException → 413, UnsupportedMediaTypeException → 415", () => {
      expect(run(new PayloadTooLargeException("Quá lớn")).body.code).toBe(
        "PAYLOAD_TOO_LARGE",
      );
      expect(run(new UnsupportedMediaTypeException("Sai loại")).body.code).toBe(
        "UNSUPPORTED_MEDIA_TYPE",
      );
    });

    it("ConflictException → 409 CONFLICT", () => {
      const { status, body } = run(new ConflictException("Trùng"));

      expect(status).toBe(409);
      expect(body.code).toBe("CONFLICT");
    });

    it("lỗi 4xx/404 không log error (không phải bug server)", () => {
      run(new NotFoundException());
      expect(logError).not.toHaveBeenCalled();
    });
  });

  describe("lỗi Postgres", () => {
    it.each(["23505", "23503"])("%s → 409 CONFLICT", (code) => {
      const { status, body } = run(drizzleError(code));

      expect(status).toBe(409);
      expect(body.code).toBe("CONFLICT");
    });

    it("409 không lộ câu SQL ra client", () => {
      const { body } = run(drizzleError("23505"));
      expect(JSON.stringify(body)).not.toContain("insert into");
    });

    it.each(["23514", "23502"])("%s → 500 INTERNAL, có log", (code) => {
      const { status, body } = run(drizzleError(code));

      expect(status).toBe(500);
      expect(body.code).toBe("INTERNAL");
      expect(logError).toHaveBeenCalled();
    });
  });

  describe("log lỗi pg (F1, plan 12d)", () => {
    // detail của pg chứa giá trị của dòng (có thể là dữ liệu cá nhân): tuyệt đối không log.
    const SECRET = "Jane Q. Doe";
    const checkError = () => {
      const pgError = Object.assign(
        new Error("new row violates check constraint"),
        {
          code: "23514",
          constraint: "documents_failed_has_error",
          table: "documents",
          detail: `Failing row contains (01J..., ${SECRET}, failed, null).`,
        },
      );
      return new Error("Failed query: update documents ...", {
        cause: pgError,
      });
    };
    const logged = () => JSON.stringify(logError.mock.calls);

    it("log có mã pg, tên constraint và bảng", () => {
      run(checkError());
      expect(logged()).toContain("23514");
      expect(logged()).toContain("documents_failed_has_error");
      expect(logged()).toContain("documents");
    });

    it("không log detail", () => {
      run(checkError());
      expect(logged()).not.toContain(SECRET);
      expect(logged()).not.toContain("Failing row contains");
    });

    it("body không lộ tên constraint", () => {
      const { body } = run(checkError());
      expect(JSON.stringify(body)).not.toContain("documents_failed_has_error");
    });
  });

  describe("lỗi khác", () => {
    it("ZodError thô (output không khớp contract) → 500 INTERNAL, có log", () => {
      const zodError = StaffProfile.safeParse({}).error;

      const { status, body } = run(zodError);

      expect(status).toBe(500);
      expect(body.code).toBe("INTERNAL");
      expect(body.details).toBeUndefined();
      expect(logError).toHaveBeenCalled();
    });

    it("HttpException body sai shape → không crash, suy code từ status", () => {
      const { status, body } = run(
        new ConflictException({ code: "DUPLICATE_UPLOAD", message: "x" }),
      );

      expect(status).toBe(409);
      expect(body.code).toBe("CONFLICT");
    });

    it("Error thường → 500 INTERNAL, body không chứa message/stack gốc", () => {
      const { status, body } = run(new Error("mật khẩu DB là hunter2"));

      expect(status).toBe(500);
      expect(body.code).toBe("INTERNAL");
      expect(JSON.stringify(body)).not.toContain("hunter2");
      expect(logError).toHaveBeenCalled();
    });

    it("ném giá trị không phải Error (string) vẫn ra 500, filter không crash", () => {
      const { status, body } = run("boom");

      expect(status).toBe(500);
      expect(body.code).toBe("INTERNAL");
    });
  });
});

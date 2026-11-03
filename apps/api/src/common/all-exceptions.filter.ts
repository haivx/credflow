import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  Logger,
} from "@nestjs/common";
import { ApiError, type ErrorCode } from "@credflow/contracts";
import type { Response } from "express";
import { getPgErrorCode } from "./pg-error.js";

/** HttpException không mang body ApiError thì suy code từ status. Không có trong bảng → INTERNAL. */
const CODE_BY_STATUS: Partial<Record<number, ErrorCode>> = {
  400: "VALIDATION_FAILED",
  404: "NOT_FOUND",
  409: "CONFLICT",
};

/** Lỗi pg do client gây ra (trùng unique, FK không tồn tại). CHECK/NOT NULL là bug server → 500. */
const CONFLICT_PG_CODES = new Set(["23505", "23503"]);

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const { status, body } = this.toApiError(exception);
    res.status(status).json(body);
  }

  private toApiError(exception: unknown): { status: number; body: ApiError } {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      if (status >= 500) this.logUnhandled(exception);

      // Body đã đúng format (vd từ ZodValidationPipe) thì giữ nguyên.
      const parsed = ApiError.safeParse(exception.getResponse());
      if (parsed.success) return { status, body: parsed.data };

      return {
        status,
        body: {
          code: CODE_BY_STATUS[status] ?? "INTERNAL",
          message: exception.message,
        },
      };
    }

    const pgCode = getPgErrorCode(exception);
    if (pgCode !== undefined && CONFLICT_PG_CODES.has(pgCode)) {
      // Không trả message gốc: nó chứa câu SQL và giá trị trong DB.
      return {
        status: 409,
        body: {
          code: "CONFLICT",
          message: "Dữ liệu xung đột với bản ghi đã có",
        },
      };
    }

    // Còn lại là bug phía server (kể cả ZodError khi output sai contract): log đủ, body không lộ gì.
    this.logUnhandled(exception);
    return {
      status: 500,
      body: { code: "INTERNAL", message: "Internal server error" },
    };
  }

  private logUnhandled(exception: unknown): void {
    this.logger.error(
      "Unhandled exception",
      exception instanceof Error ? exception.stack : String(exception),
    );
  }
}

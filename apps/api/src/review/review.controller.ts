import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
  Res,
} from "@nestjs/common";
import {
  type ApiError,
  type AuthUser,
  DecisionRequest,
  DecisionResponse,
  Id,
  PreviewRequest,
  PreviewResponse,
  ReviewDocumentDetail,
  ReviewQueuePage,
  ReviewQueueQuery,
} from "@credflow/contracts";
import type { Response } from "express";
import { CurrentUser, Roles } from "../auth/decorators.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { DocumentStatusConflictError } from "../documents/document-status.service.js";
import { sendStoredFile } from "../storage/send-file.js";
import { STORAGE, type Storage } from "../storage/storage.js";
import { CorrectionError } from "./corrections.js";
import {
  DocumentNotFoundError,
  NothingToPreviewError,
  ReviewDecisionService,
} from "./review-decision.service.js";
import { ReviewActionsRepository } from "./review-actions.repository.js";
import {
  InvalidCursorError,
  ReviewReadService,
} from "./review-read.service.js";

const NOT_FOUND = "Không tìm thấy giấy";

// Plan 27: chỉ người duyệt. Admin chưa vào hàng chờ ở P4.
@Roles("reviewer")
@Controller("review")
export class ReviewController {
  constructor(
    private readonly read: ReviewReadService,
    private readonly decisions: ReviewDecisionService,
    private readonly actions: ReviewActionsRepository,
    @Inject(STORAGE) private readonly storage: Storage,
  ) {}

  @Get("queue")
  async queue(
    @Query(new ZodValidationPipe(ReviewQueueQuery)) query: ReviewQueueQuery,
  ): Promise<ReviewQueuePage> {
    try {
      return ReviewQueuePage.parse(await this.read.queue(query));
    } catch (err) {
      if (err instanceof InvalidCursorError) {
        throw new BadRequestException(validation("cursor", err.message));
      }
      throw err;
    }
  }

  @Get("documents/:id")
  async detail(
    @Param("id", new ZodValidationPipe(Id)) id: string,
  ): Promise<ReviewDocumentDetail> {
    const found = await this.read.findDocument(id);
    if (found === undefined) throw new NotFoundException(NOT_FOUND);
    const reviewActions = await this.actions.listForDocument(id);
    return ReviewDocumentDetail.parse({ ...found, reviewActions });
  }

  @Get("documents/:id/file")
  async file(
    @Param("id", new ZodValidationPipe(Id)) id: string,
    @Res() res: Response,
  ): Promise<void> {
    const meta = await this.read.fileMeta(id);
    if (meta === undefined) throw new NotFoundException(NOT_FOUND);
    await sendStoredFile(res, this.storage, meta);
  }

  @Post("documents/:id/preview")
  @HttpCode(200)
  async preview(
    @Param("id", new ZodValidationPipe(Id)) id: string,
    @Body(new ZodValidationPipe(PreviewRequest)) body: PreviewRequest,
  ): Promise<PreviewResponse> {
    try {
      return PreviewResponse.parse(await this.decisions.preview(id, body));
    } catch (err) {
      throw mapError(err);
    }
  }

  @Post("documents/:id/decision")
  @HttpCode(200)
  async decide(
    @Param("id", new ZodValidationPipe(Id)) id: string,
    @Body(new ZodValidationPipe(DecisionRequest)) body: DecisionRequest,
    @CurrentUser() user: AuthUser,
  ): Promise<DecisionResponse> {
    try {
      return DecisionResponse.parse(
        await this.decisions.decide(id, user.id, body),
      );
    } catch (err) {
      throw mapError(err);
    }
  }
}

function validation(path: string, message: string): ApiError {
  return {
    code: "VALIDATION_FAILED",
    message: "Validation failed",
    details: [{ path: [path], message }],
  };
}

/** Lỗi nghiệp vụ → HTTP. Lỗi khác ném tiếp cho AllExceptionsFilter (500). */
function mapError(err: unknown): unknown {
  if (err instanceof DocumentNotFoundError) {
    return new NotFoundException(NOT_FOUND);
  }
  if (err instanceof DocumentStatusConflictError) {
    // Message cố định: client tải lại giấy để lấy `version` mới.
    return new ConflictException(
      "Giấy đã thay đổi hoặc không còn chờ duyệt, tải lại rồi thử lại",
    );
  }
  if (err instanceof NothingToPreviewError) {
    return new ConflictException(err.message);
  }
  if (err instanceof CorrectionError) {
    const body: ApiError = {
      code: "VALIDATION_FAILED",
      message: "Validation failed",
      details: err.issues.map((i) => ({
        path: ["corrections", i.index],
        message: i.message,
      })),
    };
    return new BadRequestException(body);
  }
  return err;
}

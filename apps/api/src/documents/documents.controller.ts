import {
  Controller,
  Get,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import {
  type AuthUser,
  DocumentList,
  type DocumentView,
  Id,
  UploadDocumentResponse,
} from "@credflow/contracts";
import type { Request, Response } from "express";
import { CurrentUser, Roles } from "../auth/decorators.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { DocumentsReadService } from "./documents-read.service.js";
import { DocumentsService } from "./documents.service.js";
import { parseUpload } from "./upload-parser.js";

@Controller("documents")
export class DocumentsController {
  constructor(
    private readonly documentsService: DocumentsService,
    private readonly readService: DocumentsReadService,
  ) {}

  /**
   * Upload một giấy (multipart: `file` + `declaredDocType` tuỳ chọn). Chỉ staff:
   * staffId lấy từ session, không nhận từ form. 201 = tạo mới, 200 = đã nộp file này rồi.
   */
  @Roles("staff")
  @Post()
  async upload(
    @Req() req: Request,
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    const upload = await parseUpload(
      req,
      this.documentsService.uploadOptions(),
    );
    const result = await this.documentsService.createFromUpload(
      staffIdOf(user),
      upload,
    );
    res.status(result.duplicate ? HttpStatus.OK : HttpStatus.CREATED);
    return UploadDocumentResponse.parse(result);
  }

  /** Giấy của staff đang đăng nhập, mới nhất trước (plan 17). */
  @Roles("staff")
  @Get()
  async list(@CurrentUser() user: AuthUser): Promise<DocumentList> {
    const items = await this.readService.listForStaff(staffIdOf(user));
    return DocumentList.parse({ items });
  }

  /** Giấy của người khác trả cùng 404 với id không tồn tại: không lộ giấy đó có thật. */
  @Roles("staff")
  @Get(":id")
  async getById(
    @CurrentUser() user: AuthUser,
    @Param("id", new ZodValidationPipe(Id)) id: string,
  ): Promise<DocumentView> {
    const doc = await this.readService.findForStaff(staffIdOf(user), id);
    if (doc === undefined) {
      // Message cố định, không chép id, để hai ca 404 giống hệt nhau.
      throw new NotFoundException("Không tìm thấy giấy");
    }
    return doc;
  }
}

/** DB CHECK bảo đảm user vai trò staff luôn có staffId: tới đây mà null là bug. */
function staffIdOf(user: AuthUser): string {
  if (user.staffId === null) {
    throw new Error(`User staff ${user.id} không có staffId`);
  }
  return user.staffId;
}

import { Controller, HttpStatus, Post, Req, Res } from "@nestjs/common";
import { type AuthUser, UploadDocumentResponse } from "@credflow/contracts";
import type { Request, Response } from "express";
import { CurrentUser, Roles } from "../auth/decorators.js";
import { DocumentsService } from "./documents.service.js";
import { parseUpload } from "./upload-parser.js";

@Controller("documents")
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

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
    if (user.staffId === null) {
      // DB CHECK bảo đảm user vai trò staff luôn có staffId: tới đây là bug.
      throw new Error(`User staff ${user.id} không có staffId`);
    }
    const upload = await parseUpload(
      req,
      this.documentsService.uploadOptions(),
    );
    const result = await this.documentsService.createFromUpload(
      user.staffId,
      upload,
    );
    res.status(result.duplicate ? HttpStatus.OK : HttpStatus.CREATED);
    return UploadDocumentResponse.parse(result);
  }
}

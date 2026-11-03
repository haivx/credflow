import { Controller, Get, HttpStatus, Res } from "@nestjs/common";
import type { Response } from "express";
import { ReadyService } from "./ready.service.js";
import { Public } from "../auth/decorators.js";

// Probe của hệ thống deploy, không có cookie.
@Public()
@Controller("ready")
export class ReadyController {
  constructor(private readonly readyService: ReadyService) {}

  // 503 là báo cáo trạng thái cho load balancer, không phải lỗi: set status rồi return,
  // không throw, để exception filter không đổi body thành ApiError và không log như bug.
  @Get()
  async ready(@Res({ passthrough: true }) res: Response) {
    const result = await this.readyService.check();
    if (result.status === "error") {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
    }
    return result;
  }
}

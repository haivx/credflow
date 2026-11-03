import { Controller, Get } from "@nestjs/common";
import { AppInfoService } from "../app-info/app-info.service.js";
import { Public } from "../auth/decorators.js";

// Probe của hệ thống deploy, không có cookie.
@Public()
@Controller("health")
export class HealthController {
  constructor(private readonly appInfoService: AppInfoService) {}

  @Get()
  health() {
    return {
      ...this.appInfoService.getAppInfo(),
      status: "ok",
    };
  }
}

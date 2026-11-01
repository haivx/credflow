import { Controller, Get } from "@nestjs/common";
import { AppInfoService } from "../app-info/app-info.service.js";

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

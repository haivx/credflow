import { Module } from "@nestjs/common";
import { AppInfoService } from "./app-info.service.js";

@Module({
  exports: [AppInfoService],
  providers: [AppInfoService],
})
export class AppInfoModule {}

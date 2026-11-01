import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller.js";
import { AppInfoModule } from "../app-info/app-info.module.js";

@Module({
  imports: [AppInfoModule],
  controllers: [HealthController],
})
export class HealthModule {}

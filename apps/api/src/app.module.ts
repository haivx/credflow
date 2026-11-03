import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_FILTER } from "@nestjs/core";
import { AllExceptionsFilter } from "./common/all-exceptions.filter.js";
import { HealthModule } from "./health/health.module.js";
import { baseConfig } from "./config/config.options.js";
import { StaffModule } from "./staff/staff.module.js";

@Module({
  imports: [ConfigModule.forRoot(baseConfig), HealthModule, StaffModule],
  // Đăng ký ở module (không phải main.ts) để integration test dựng từ AppModule cũng có filter.
  providers: [{ provide: APP_FILTER, useClass: AllExceptionsFilter }],
})
export class AppModule {}

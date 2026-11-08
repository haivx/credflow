import {
  type MiddlewareConsumer,
  Module,
  type NestModule,
} from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_FILTER } from "@nestjs/core";
import cookieParser from "cookie-parser";
import { AuthModule } from "./auth/auth.module.js";
import { AllExceptionsFilter } from "./common/all-exceptions.filter.js";
import { DocumentsModule } from "./documents/documents.module.js";
import { HealthModule } from "./health/health.module.js";
import { RateLimitModule } from "./rate-limit/rate-limit.module.js";
import { baseConfig } from "./config/config.options.js";
import { ReviewModule } from "./review/review.module.js";
import { StaffModule } from "./staff/staff.module.js";

@Module({
  imports: [
    ConfigModule.forRoot(baseConfig),
    AuthModule,
    DocumentsModule,
    HealthModule,
    RateLimitModule,
    ReviewModule,
    StaffModule,
  ],
  // Đăng ký ở module (không phải main.ts) để integration test dựng từ AppModule cũng có filter.
  providers: [{ provide: APP_FILTER, useClass: AllExceptionsFilter }],
})
export class AppModule implements NestModule {
  // Middleware chạy trước guard: parse header Cookie vào req.cookies cho AuthGuard đọc.
  // Cũng đăng ký ở module (không phải main.ts) vì lý do như filter ở trên.
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(cookieParser()).forRoutes("{*splat}");
  }
}

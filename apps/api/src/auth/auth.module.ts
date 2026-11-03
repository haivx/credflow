import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { DbModule } from "../db/db.module.js";
import { AuthController } from "./auth.controller.js";
import { AuthGuard } from "./auth.guard.js";
import { AuthService } from "./auth.service.js";
import { RolesGuard } from "./roles.guard.js";

@Module({
  imports: [DbModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    // Guard toàn cục chạy theo thứ tự đăng ký: biết user là ai (AuthGuard) rồi mới kiểm vai trò.
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AuthModule {}

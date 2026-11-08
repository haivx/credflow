import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import type { Env } from "../config/env.schema.js";
import { DbModule } from "../db/db.module.js";
import { AuthController } from "./auth.controller.js";
import { AuthGuard } from "./auth.guard.js";
import { AuthService } from "./auth.service.js";
import { GoogleAuthController } from "./google/google-auth.controller.js";
import { GoogleAuthService } from "./google/google-auth.service.js";
import {
  createGoogleOAuth,
  GOOGLE_OAUTH,
} from "./google/google-oauth.client.js";
import { RolesGuard } from "./roles.guard.js";

@Module({
  imports: [DbModule],
  controllers: [AuthController, GoogleAuthController],
  providers: [
    AuthService,
    GoogleAuthService,
    // Plan 36: thiếu biến Google (env đã kiểm đủ cả nhóm hoặc không có) → null = tính năng tắt.
    {
      provide: GOOGLE_OAUTH,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const clientId = config.get("GOOGLE_CLIENT_ID", { infer: true });
        const clientSecret = config.get("GOOGLE_CLIENT_SECRET", {
          infer: true,
        });
        const redirectUrl = config.get("GOOGLE_REDIRECT_URL", { infer: true });
        if (
          clientId === undefined ||
          clientSecret === undefined ||
          redirectUrl === undefined
        ) {
          return null;
        }
        return createGoogleOAuth({ clientId, clientSecret, redirectUrl });
      },
    },
    // Guard toàn cục chạy theo thứ tự đăng ký: biết user là ai (AuthGuard) rồi mới kiểm vai trò.
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AuthModule {}

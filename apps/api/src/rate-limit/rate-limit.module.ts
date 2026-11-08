import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ThrottlerModule } from "@nestjs/throttler";
import type { Env } from "../config/env.schema.js";

/** Tên bộ đếm, dùng trong `@SkipThrottle({ ... })` ở controller. */
export const LOGIN_THROTTLER = "login";
export const UPLOAD_THROTTLER = "upload";

const HOUR_MS = 60 * 60 * 1000;

/**
 * Bộ đếm đăng nhập theo email (chữ thường), không theo IP: request tới `api` đi qua Railway edge
 * rồi Next rewrite, IP thật nằm trong `X-Forwarded-For` do proxy ghép và giả được. Rủi ro thật
 * là đoán mật khẩu một tài khoản, đếm theo email chặn đúng chỗ đó (plan 34).
 */
export function loginTracker(req: Record<string, unknown>): string {
  const body = req.body;
  const email =
    typeof body === "object" &&
    body !== null &&
    "email" in body &&
    typeof body.email === "string"
      ? body.email.trim().toLowerCase()
      : "";
  return `login:${email}`;
}

/** Bộ đếm upload theo user đã đăng nhập (AuthGuard toàn cục gắn `req.user` trước). */
export function uploadTracker(req: Record<string, unknown>): string {
  const user = req.user;
  const id =
    typeof user === "object" &&
    user !== null &&
    "id" in user &&
    typeof user.id === "string"
      ? user.id
      : "anonymous";
  return `upload:${id}`;
}

/**
 * Rate limit cho demo công khai (plan 34). Bộ đếm trong bộ nhớ process `api`: đúng khi chạy
 * 1 replica; nhiều replica cần lưu bộ đếm ở Redis (Học nâng cao). Guard gắn theo từng route
 * (`@UseGuards(ThrottlerGuard)`), không toàn cục, để route khác không bị đếm.
 */
@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        errorMessage: "Thao tác quá nhiều lần, hãy thử lại sau ít phút.",
        throttlers: [
          {
            name: LOGIN_THROTTLER,
            limit: config.get("LOGIN_RATE_LIMIT", { infer: true }),
            ttl:
              config.get("LOGIN_RATE_WINDOW_MIN", { infer: true }) * 60 * 1000,
            getTracker: loginTracker,
          },
          {
            name: UPLOAD_THROTTLER,
            limit: config.get("UPLOAD_RATE_PER_HOUR", { infer: true }),
            ttl: HOUR_MS,
            getTracker: uploadTracker,
          },
        ],
      }),
    }),
  ],
})
export class RateLimitModule {}

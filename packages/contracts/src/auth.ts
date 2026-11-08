import * as z from "zod";
import { Id } from "./common.js";

// Đã chốt 2026-11-03 (plan 10, ADR 0004). Đăng nhập cơ bản: email + mật khẩu, session cookie.

/** Mỗi user có đúng một vai trò. */
export const UserRole = z
  .enum(["staff", "reviewer", "admin"])
  .meta({ id: "UserRole" });
export type UserRole = z.infer<typeof UserRole>;

/** Body của POST /auth/login. Email so sánh không phân biệt hoa thường (API chuẩn hoá về chữ thường). */
export const LoginRequest = z
  .strictObject({
    email: z.email(),
    password: z.string().min(1).max(256),
  })
  .meta({ id: "LoginRequest" });
export type LoginRequest = z.infer<typeof LoginRequest>;

/** User đang đăng nhập: response của login và GET /auth/me. Không bao giờ chứa passwordHash. */
export const AuthUser = z
  .object({
    id: Id,
    email: z.email(),
    role: UserRole,
    /** Chỉ user vai trò `staff` có; reviewer và admin là null. */
    staffId: Id.nullable(),
  })
  .meta({ id: "AuthUser" });
export type AuthUser = z.infer<typeof AuthUser>;

// Plan 36, ADR 0015: staff tự đăng ký bằng Google.

/** Response của GET /auth/providers: web biết có hiện nút Google không. */
export const AuthProviders = z
  .strictObject({ google: z.boolean() })
  .meta({ id: "AuthProviders" });
export type AuthProviders = z.infer<typeof AuthProviders>;

/** Mã lỗi callback Google gửi về web qua `/login?error=<mã>`. Không mang chi tiết kỹ thuật. */
export const GoogleLoginError = z
  .enum(["google_failed", "email_exists", "signup_closed"])
  .meta({ id: "GoogleLoginError" });
export type GoogleLoginError = z.infer<typeof GoogleLoginError>;

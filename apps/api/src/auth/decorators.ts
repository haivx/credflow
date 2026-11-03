import {
  createParamDecorator,
  type ExecutionContext,
  SetMetadata,
} from "@nestjs/common";
import type { AuthUser, UserRole } from "@credflow/contracts";
import type { Request } from "express";

/** Request sau khi AuthGuard chạy qua: có user nếu route không phải @Public. */
export type AuthedRequest = Request & { user?: AuthUser };

export const IS_PUBLIC_KEY = "auth:isPublic";
export const ROLES_KEY = "auth:roles";

/** Route không cần đăng nhập. Mặc định mọi route đều cần (AuthGuard toàn cục). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Chỉ các vai trò này được gọi. Không gắn thì mọi user đã đăng nhập đều được. */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

/** User đang đăng nhập, do AuthGuard gắn vào request. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const user = ctx.switchToHttp().getRequest<AuthedRequest>().user;
    if (user === undefined) {
      // Chỉ xảy ra khi dùng @CurrentUser trên route @Public: lỗi của code, ra 500.
      throw new Error("@CurrentUser() dùng trên route không qua AuthGuard");
    }
    return user;
  },
);

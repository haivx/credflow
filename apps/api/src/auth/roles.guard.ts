import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { UserRole } from "@credflow/contracts";
import { type AuthedRequest, ROLES_KEY } from "./decorators.js";

/** Chạy sau AuthGuard: đã biết user là ai (401 nếu chưa), giờ kiểm vai trò (403 nếu sai). */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<UserRole[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (roles === undefined || roles.length === 0) return true;

    const user = context.switchToHttp().getRequest<AuthedRequest>().user;
    if (user === undefined) {
      // Route vừa @Public vừa @Roles: chưa đăng nhập thì không biết vai trò.
      throw new UnauthorizedException("Chưa đăng nhập");
    }
    if (!roles.includes(user.role)) {
      throw new ForbiddenException("Không có quyền truy cập");
    }
    return true;
  }
}

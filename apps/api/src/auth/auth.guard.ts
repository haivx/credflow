import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuthService } from "./auth.service.js";
import { type AuthedRequest, IS_PUBLIC_KEY } from "./decorators.js";
import { readSessionToken } from "./session-token.js";

/**
 * Guard toàn cục: mặc định mọi route phải đăng nhập, route mở thì gắn @Public().
 * Quên gắn decorator thì route bị khoá chứ không bị mở.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Handler trước, class sau: @Public() trên method thắng metadata trên controller.
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(
      IS_PUBLIC_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (isPublic === true) return true;

    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const token = readSessionToken(req);
    if (token === undefined) {
      throw new UnauthorizedException("Chưa đăng nhập");
    }
    const user = await this.authService.findUserBySessionToken(token);
    if (user === undefined) {
      throw new UnauthorizedException("Session không hợp lệ hoặc đã hết hạn");
    }
    req.user = user;
    return true;
  }
}

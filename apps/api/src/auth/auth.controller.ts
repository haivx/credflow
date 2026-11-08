import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { SkipThrottle, ThrottlerGuard } from "@nestjs/throttler";
import { ConfigService } from "@nestjs/config";
import { AuthUser, LoginRequest } from "@credflow/contracts";
import type { Request, Response } from "express";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import type { Env } from "../config/env.schema.js";
import { AuthService } from "./auth.service.js";
import { CurrentUser, Public } from "./decorators.js";
import {
  authCookieOptions,
  readSessionToken,
  SESSION_COOKIE,
} from "./session-token.js";
import { UPLOAD_THROTTLER } from "../rate-limit/rate-limit.module.js";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Public()
  // Plan 34: tối đa LOGIN_RATE_LIMIT lần mỗi email trong LOGIN_RATE_WINDOW_MIN phút → 429.
  @UseGuards(ThrottlerGuard)
  @SkipThrottle({ [UPLOAD_THROTTLER]: true })
  @Post("login")
  @HttpCode(HttpStatus.OK)
  async login(
    @Body(new ZodValidationPipe(LoginRequest)) body: LoginRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(body);
    if (result === null) {
      // Cùng một câu cho sai email và sai mật khẩu: không lộ email nào có tài khoản.
      throw new UnauthorizedException("Email hoặc mật khẩu không đúng");
    }
    res.cookie(SESSION_COOKIE, result.token, {
      ...this.cookieOptions(),
      expires: result.expiresAt,
    });
    return AuthUser.parse(result.user);
  }

  @Post("logout")
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const token = readSessionToken(req);
    if (token !== undefined) await this.authService.logout(token);
    // clearCookie phải cùng path/sameSite/secure với lúc set, không thì trình duyệt không xoá.
    res.clearCookie(SESSION_COOKIE, this.cookieOptions());
  }

  @Get("me")
  me(@CurrentUser() user: AuthUser) {
    return AuthUser.parse(user);
  }

  private cookieOptions() {
    return authCookieOptions(this.config.get("COOKIE_SECURE", { infer: true }));
  }
}

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
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AuthUser, LoginRequest } from "@credflow/contracts";
import type { CookieOptions, Request, Response } from "express";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import type { Env } from "../config/env.schema.js";
import { AuthService } from "./auth.service.js";
import { CurrentUser, Public } from "./decorators.js";
import { readSessionToken, SESSION_COOKIE } from "./session-token.js";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Public()
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

  private cookieOptions(): CookieOptions {
    return {
      // JS trên trang không đọc được cookie: XSS không lấy trộm được token.
      httpOnly: true,
      // Trình duyệt không gửi cookie trong POST từ site khác: chặn phần lớn CSRF.
      sameSite: "lax",
      // Chỉ gửi qua HTTPS. Dev chạy http nên tắt bằng env.
      secure: this.config.get("COOKIE_SECURE", { infer: true }),
      path: "/",
    };
  }
}

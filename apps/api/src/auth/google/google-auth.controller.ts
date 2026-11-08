import {
  Controller,
  Get,
  NotFoundException,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AuthProviders } from "@credflow/contracts";
import type { Request, Response } from "express";
import * as z from "zod";
import type { Env } from "../../config/env.schema.js";
import { Public } from "../decorators.js";
import { authCookieOptions, SESSION_COOKIE } from "../session-token.js";
import { GoogleAuthService } from "./google-auth.service.js";
import { OAUTH_COOKIE, OAUTH_STATE_TTL_MS } from "./oauth-state.js";

// Google gửi thêm scope, authuser, prompt…: chỉ lấy 3 trường cần, bỏ qua phần còn lại.
const CallbackQuery = z.object({
  code: z.string().min(1).optional(),
  state: z.string().min(1).optional(),
  error: z.string().min(1).optional(),
});
const OAuthCookies = z.object({ [OAUTH_COOKIE]: z.string().min(1) });

/**
 * Đăng nhập Google (plan 36). Redirect dùng đường dẫn tương đối: request tới qua rewrite `/api`
 * của web, nên `/` là trang chủ web, không phải api.
 */
@Controller("auth")
export class GoogleAuthController {
  constructor(
    private readonly google: GoogleAuthService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Public()
  @Get("providers")
  providers(): AuthProviders {
    return AuthProviders.parse({ google: this.google.enabled() });
  }

  @Public()
  @Get("google")
  start(@Res() res: Response): void {
    if (!this.google.enabled()) throw new NotFoundException();
    const { redirectUrl, cookie } = this.google.start(Date.now());
    res.cookie(OAUTH_COOKIE, cookie, {
      ...this.cookieOptions(),
      maxAge: OAUTH_STATE_TTL_MS,
    });
    res.redirect(302, redirectUrl);
  }

  @Public()
  @Get("google/callback")
  async callback(
    @Query() rawQuery: unknown,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    if (!this.google.enabled()) throw new NotFoundException();
    const query = CallbackQuery.safeParse(rawQuery).data ?? {};
    const cookie = OAuthCookies.safeParse(req.cookies).data?.[OAUTH_COOKIE];
    // State chỉ dùng một lần, kết quả thế nào cũng xoá.
    res.clearCookie(OAUTH_COOKIE, this.cookieOptions());

    const result = await this.google.finish(query, cookie, new Date());
    if (!result.ok) {
      res.redirect(302, `/?google_error=${result.error}`);
      return;
    }
    res.cookie(SESSION_COOKIE, result.token, {
      ...this.cookieOptions(),
      expires: result.expiresAt,
    });
    res.redirect(302, "/");
  }

  private cookieOptions() {
    return authCookieOptions(this.config.get("COOKIE_SECURE", { infer: true }));
  }
}

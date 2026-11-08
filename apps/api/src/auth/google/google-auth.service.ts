import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { GoogleLoginError } from "@credflow/contracts";
import { and, count, eq, gte, isNotNull } from "drizzle-orm";
import { ulid } from "ulid";
import type { Env } from "../../config/env.schema.js";
import { type Db, DB } from "../../db/db.provider.js";
import { staff, users } from "../../db/schema.js";
import { AuthService } from "../auth.service.js";
import {
  GOOGLE_OAUTH,
  type GoogleIdentity,
  type GoogleOAuth,
} from "./google-oauth.client.js";
import {
  newOAuthAttempt,
  readOAuthCookie,
  signOAuthCookie,
} from "./oauth-state.js";

/** Hồ sơ staff mặc định cho tài khoản tự đăng ký (ADR 0015). Không thuộc khách hàng → config default. */
const NEW_STAFF_ROLE = "caregiver";
const NEW_STAFF_REGION = "CA";

export type GoogleCallbackResult =
  | { ok: true; token: string; expiresAt: Date }
  | { ok: false; error: GoogleLoginError };

export interface GoogleCallbackQuery {
  code?: string;
  state?: string;
  error?: string;
}

/**
 * Đăng ký / đăng nhập bằng Google (plan 36, ADR 0015). Controller chỉ lo cookie và redirect;
 * mọi quyết định "có tin được không, có tạo tài khoản không" nằm ở đây.
 */
@Injectable()
export class GoogleAuthService {
  private readonly logger = new Logger(GoogleAuthService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(GOOGLE_OAUTH) private readonly google: GoogleOAuth | null,
    private readonly auth: AuthService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  enabled(): boolean {
    return this.google !== null;
  }

  /** Bước 1: URL của Google + giá trị cookie state/PKCE. Chỉ gọi khi `enabled()`. */
  start(nowMs: number): { redirectUrl: string; cookie: string } {
    const google = this.requireGoogle();
    const attempt = newOAuthAttempt();
    return {
      redirectUrl: google.authUrl(attempt.state, attempt.codeChallenge),
      cookie: signOAuthCookie(attempt, this.stateSecret(), nowMs),
    };
  }

  /** Bước 2: Google chuyển hướng về. Lỗi nào cũng chỉ trả mã chung, chi tiết ghi log. */
  async finish(
    query: GoogleCallbackQuery,
    cookie: string | undefined,
    now: Date,
  ): Promise<GoogleCallbackResult> {
    const google = this.requireGoogle();
    const saved = readOAuthCookie(cookie, this.stateSecret(), now.getTime());
    if (
      saved === null ||
      query.state === undefined ||
      query.state !== saved.state
    ) {
      this.logger.warn("Google callback: state thiếu, hết hạn hoặc không khớp");
      return { ok: false, error: "google_failed" };
    }
    if (query.error !== undefined || query.code === undefined) {
      // Người dùng bấm Huỷ (access_denied) hoặc Google báo lỗi.
      this.logger.log(`Google callback: ${query.error ?? "thiếu code"}`);
      return { ok: false, error: "google_failed" };
    }

    let identity: GoogleIdentity;
    try {
      identity = await google.exchange(query.code, saved.codeVerifier);
    } catch (err) {
      this.logger.warn(
        `Google callback: đổi code thất bại (${err instanceof Error ? err.message : "lỗi lạ"})`,
      );
      return { ok: false, error: "google_failed" };
    }
    // Email chưa xác minh thì không chắc người này sở hữu email đó.
    if (!identity.emailVerified) {
      this.logger.warn("Google callback: email chưa xác minh");
      return { ok: false, error: "google_failed" };
    }

    const existing = await this.findBySub(identity.sub);
    if (existing !== undefined) return this.session(existing);

    const email = identity.email.toLowerCase();
    const [sameEmail] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email));
    // Không tự liên kết: Gmail trùng email tài khoản mật khẩu không được vào tài khoản đó.
    if (sameEmail !== undefined) return { ok: false, error: "email_exists" };

    if (await this.signupCapReached(now)) {
      this.logger.warn("Google callback: đã đủ trần đăng ký hôm nay");
      return { ok: false, error: "signup_closed" };
    }

    try {
      return await this.session(await this.createStaffAccount(identity, email));
    } catch (err) {
      // Hai tab đăng ký cùng lúc: tab sau đụng unique `google_sub`, tài khoản đã có → dùng luôn.
      const raced = await this.findBySub(identity.sub);
      if (raced !== undefined) return this.session(raced);
      this.logger.error(
        `Google callback: tạo tài khoản lỗi (${err instanceof Error ? err.message : "lỗi lạ"})`,
      );
      return { ok: false, error: "google_failed" };
    }
  }

  private async session(userId: string): Promise<GoogleCallbackResult> {
    return { ok: true, ...(await this.auth.createSession(userId)) };
  }

  private async findBySub(sub: string): Promise<string | undefined> {
    const [row] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.googleSub, sub));
    return row?.id;
  }

  /** Đếm tài khoản Google tạo từ 0h UTC hôm nay. Hai đăng ký cùng lúc có thể vượt trần 1. */
  private async signupCapReached(now: Date): Promise<boolean> {
    const startOfDay = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const [row] = await this.db
      .select({ n: count() })
      .from(users)
      .where(and(isNotNull(users.googleSub), gte(users.createdAt, startOfDay)));
    return (
      (row?.n ?? 0) >= this.config.get("SIGNUP_DAILY_CAP", { infer: true })
    );
  }

  /** Hồ sơ staff + user trong một transaction: không bao giờ có user staff thiếu hồ sơ. */
  private async createStaffAccount(
    identity: GoogleIdentity,
    email: string,
  ): Promise<string> {
    const staffId = ulid();
    const userId = ulid();
    await this.db.transaction(async (tx) => {
      await tx.insert(staff).values({
        id: staffId,
        legalName: identity.name?.trim() || email.split("@")[0] || email,
        role: NEW_STAFF_ROLE,
        clientIds: [],
        region: NEW_STAFF_REGION,
      });
      await tx.insert(users).values({
        id: userId,
        email,
        passwordHash: null,
        googleSub: identity.sub,
        role: "staff",
        staffId,
      });
    });
    this.logger.log(`Tạo tài khoản staff mới từ Google (user ${userId})`);
    return userId;
  }

  private requireGoogle(): GoogleOAuth {
    if (this.google === null) throw new Error("Google OAuth chưa bật");
    return this.google;
  }

  private stateSecret(): string {
    const secret = this.config.get("OAUTH_STATE_SECRET", { infer: true });
    if (secret === undefined) throw new Error("Thiếu OAUTH_STATE_SECRET");
    return secret;
  }
}

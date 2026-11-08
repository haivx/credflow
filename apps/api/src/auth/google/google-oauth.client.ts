import { CodeChallengeMethod, OAuth2Client } from "google-auth-library";

/** Danh tính Google đã kiểm chữ ký + audience của id_token. */
export interface GoogleIdentity {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
}

/**
 * Phần nói chuyện với Google (plan 36). Tách thành provider tiêm được để integration test thay
 * bằng bản giả: test không gọi mạng tới Google, nhưng vẫn chạy thật mọi kiểm tra của service.
 */
export interface GoogleOAuth {
  authUrl(state: string, codeChallenge: string): string;
  /** Đổi `code` lấy token rồi kiểm id_token. Lỗi mạng, code sai, token sai → ném lỗi. */
  exchange(code: string, codeVerifier: string): Promise<GoogleIdentity>;
}

export const GOOGLE_OAUTH = Symbol("GOOGLE_OAUTH");

export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUrl: string;
}

export function createGoogleOAuth(config: GoogleOAuthConfig): GoogleOAuth {
  const client = new OAuth2Client({
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    redirectUri: config.redirectUrl,
  });
  return {
    authUrl(state, codeChallenge) {
      return client.generateAuthUrl({
        scope: ["openid", "email", "profile"],
        state,
        code_challenge: codeChallenge,
        code_challenge_method: CodeChallengeMethod.S256,
        // Luôn cho chọn tài khoản: người thử demo hay có nhiều Gmail.
        prompt: "select_account",
      });
    },
    async exchange(code, codeVerifier) {
      const { tokens } = await client.getToken({ code, codeVerifier });
      if (typeof tokens.id_token !== "string") {
        throw new Error("Google không trả id_token");
      }
      // Kiểm chữ ký (khoá công khai của Google), hạn, issuer và audience = client ID của app.
      const ticket = await client.verifyIdToken({
        idToken: tokens.id_token,
        audience: config.clientId,
      });
      const payload = ticket.getPayload();
      if (payload?.email === undefined) {
        throw new Error("id_token không có email");
      }
      return {
        sub: payload.sub,
        email: payload.email,
        emailVerified: payload.email_verified === true,
        name: payload.name ?? null,
      };
    },
  };
}

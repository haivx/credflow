import { z } from "zod";

export const envSchema = z.object({
  ANTHROPIC_API_KEY: z
    .string()
    .min(1, "ANTHROPIC_API_KEY must not be empty")
    .optional(),
  DATABASE_URL: z.url("DATABASE_URL must be a valid URL"),
  API_PORT: z.coerce
    .number()
    .min(1, "API_PORT must be a positive number")
    .max(65535, "API_PORT must be a valid port number")
    .int()
    .default(8787),
  REDIS_URL: z.url("REDIS_URL must be a valid URL"),
  API_HOST: z.string().min(1, "API_HOST is required").default("127.0.0.1"),
  DATA_DIR: z.string().min(1, "DATA_DIR is required").default("./data"),
  SESSION_TTL_DAYS: z.coerce
    .number()
    .int()
    .min(1, "SESSION_TTL_DAYS must be at least 1")
    .default(7),
  // stringbool: "false" → false. z.coerce.boolean() sẽ biến chuỗi "false" thành true.
  COOKIE_SECURE: z.stringbool().default(false),
  // Giới hạn dung lượng một file upload, tính bằng byte. Mặc định 10 MB.
  UPLOAD_MAX_BYTES: z.coerce
    .number()
    .int()
    .min(1, "UPLOAD_MAX_BYTES must be at least 1")
    .default(10 * 1024 * 1024),
  // Thư mục config rule: default.yaml + clients/<clientId>.yaml (plan 25). Tính từ apps/api.
  RULES_CONFIG_PATH: z
    .string()
    .min(1, "RULES_CONFIG_PATH must not be empty")
    .default("../../config/rules"),
  // Nơi lưu file upload (plan 33): `local` = đĩa dưới DATA_DIR (dev); `s3` = bucket tương thích S3
  // (Railway Bucket trên production, vì api và worker là hai container không chung đĩa).
  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  S3_BUCKET: z.string().min(1).optional(),
  S3_ENDPOINT: z.url("S3_ENDPOINT must be a valid URL").optional(),
  S3_REGION: z.string().min(1).default("auto"),
  S3_ACCESS_KEY_ID: z.string().min(1).optional(),
  S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  // Bucket cũ của Railway có thể cần URL kiểu path-style (tab Credentials của bucket ghi rõ).
  S3_FORCE_PATH_STYLE: z.stringbool().default(false),
  // Bảo vệ demo công khai (plan 34). Mặc định mức "chặt" Liam chọn 2026-11-08.
  /** Số lần đăng nhập tối đa mỗi email trong một cửa sổ. */
  LOGIN_RATE_LIMIT: z.coerce.number().int().min(1).default(5),
  LOGIN_RATE_WINDOW_MIN: z.coerce.number().int().min(1).default(15),
  /** Số upload tối đa mỗi user trong một giờ. */
  UPLOAD_RATE_PER_HOUR: z.coerce.number().int().min(1).default(10),
  /** Số giấy mới tối đa toàn hệ thống mỗi ngày (UTC): trần tiền gọi Claude. */
  DAILY_UPLOAD_CAP: z.coerce.number().int().min(1).default(50),
  /** Xoá file của giấy nộp quá N ngày (giữ dòng DB). 0 = không xoá. */
  FILE_RETENTION_DAYS: z.coerce.number().int().min(0).default(3),
  // Khoá chủ mã hoá khoá Anthropic admin lưu (plan 35, ADR 0014): base64 của đúng 32 byte
  // (`openssl rand -base64 32`). Không đặt thì không lưu được khoá riêng, chế độ mặc định vẫn chạy.
  // api và worker phải cùng giá trị.
  SETTINGS_ENCRYPTION_KEY: z
    .string()
    .refine(
      (v) => Buffer.from(v, "base64").length === 32,
      "SETTINGS_ENCRYPTION_KEY phải là base64 của đúng 32 byte",
    )
    .optional(),
  // Đăng ký bằng Google (plan 36, ADR 0015). Đặt cả 4 hoặc không đặt biến nào (tắt tính năng).
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
  // Phải trùng "Authorized redirect URI" trên Google Cloud Console; đi qua rewrite `/api` của web,
  // vd `https://<web>/api/auth/google/callback`, để cookie nằm cùng domain web.
  GOOGLE_REDIRECT_URL: z
    .url("GOOGLE_REDIRECT_URL must be a valid URL")
    .optional(),
  // Khoá HMAC ký cookie state/PKCE (`openssl rand -base64 32`).
  OAUTH_STATE_SECRET: z
    .string()
    .min(32, "OAUTH_STATE_SECRET phải dài ít nhất 32 ký tự")
    .optional(),
  /** Số tài khoản Google mới tối đa mỗi ngày (UTC). */
  SIGNUP_DAILY_CAP: z.coerce.number().int().min(1).default(20),
});

export type Env = z.infer<typeof envSchema>;

const GOOGLE_VARS = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_REDIRECT_URL",
  "OAUTH_STATE_SECRET",
] as const;

const S3_REQUIRED = [
  "S3_BUCKET",
  "S3_ENDPOINT",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
] as const;

/**
 * Schema ConfigModule dùng lúc khởi động: `envSchema` + kiểm chéo giữa các biến.
 * Tách riêng vì Zod 4 không cho `.pick()` trên schema có refine, mà seed, eval, drizzle.config
 * đang `envSchema.pick(...)`.
 */
export const appEnvSchema = envSchema.superRefine((env, ctx) => {
  // Plan 34: giá trị dán vào dashboard hay kéo theo khoảng trắng; lỗi gốc lộ ra rất khó hiểu
  // (vd `getaddrinfo ENOTFOUND  ::`). Chặn ngay lúc khởi động, nêu tên biến.
  for (const [key, value] of Object.entries(env)) {
    if (typeof value === "string" && value !== value.trim()) {
      ctx.addIssue({
        code: "custom",
        path: [key],
        message: `${key} có khoảng trắng ở đầu hoặc cuối giá trị`,
      });
    }
  }
  // Đặt một phần nhóm Google thường là quên một biến: báo ngay thay vì tắt tính năng lặng lẽ.
  const googleSet = GOOGLE_VARS.filter((key) => env[key] !== undefined);
  if (googleSet.length > 0) {
    for (const key of GOOGLE_VARS) {
      if (env[key] === undefined) {
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: `${key} is required when any GOOGLE_* variable is set`,
        });
      }
    }
  }
  if (env.STORAGE_DRIVER !== "s3") return;
  for (const key of S3_REQUIRED) {
    if (env[key] === undefined) {
      ctx.addIssue({
        code: "custom",
        path: [key],
        message: `${key} is required when STORAGE_DRIVER=s3`,
      });
    }
  }
});

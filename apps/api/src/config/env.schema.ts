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
});

export type Env = z.infer<typeof envSchema>;

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

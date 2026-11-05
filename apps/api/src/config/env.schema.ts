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
  // Tính từ thư mục chạy là apps/api (nest start, vitest).
  RULES_CONFIG_PATH: z
    .string()
    .min(1, "RULES_CONFIG_PATH must not be empty")
    .default("../../config/rules/default.yaml"),
});

export type Env = z.infer<typeof envSchema>;

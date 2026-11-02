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
});

export type Env = z.infer<typeof envSchema>;

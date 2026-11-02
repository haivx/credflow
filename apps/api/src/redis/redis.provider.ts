import type { FactoryProvider } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Redis } from "ioredis";
import type { Env } from "../config/env.schema.js";

export const REDIS = Symbol("REDIS");

export const redisProvider = {
  provide: REDIS,
  inject: [ConfigService],
  useFactory: (config: ConfigService<Env, true>) => {
    // TODO bước 1 (plan 06): chọn option để lệnh fail nhanh khi Redis chết
    // (enableOfflineQueue, maxRetriesPerRequest, connectTimeout).
    const redis = new Redis(config.get("REDIS_URL", { infer: true }));
    // Không có listener 'error' thì Node coi là lỗi không bắt và kill process (giống pool ở plan 05).
    redis.on("error", (err) => {
      console.error("Redis client error:", err.message);
    });
    return redis;
  },
} satisfies FactoryProvider<Redis>;

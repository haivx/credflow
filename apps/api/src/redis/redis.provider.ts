import { type FactoryProvider, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Redis } from "ioredis";
import type { Env } from "../config/env.schema.js";

export const REDIS = Symbol("REDIS");

export const redisProvider = {
  provide: REDIS,
  inject: [ConfigService],
  useFactory: (config: ConfigService<Env, true>) => {
    // Client cho /ready: Redis chết thì lệnh lỗi nhanh, không xếp hàng chờ. Vẫn tự reconnect
    // (retryStrategy mặc định) để Redis sống lại thì /ready tự về 200. Worker BullMQ (P1) dùng
    // connection riêng với maxRetriesPerRequest: null.
    const redis = new Redis(config.get("REDIS_URL", { infer: true }), {
      enableOfflineQueue: false, // chưa kết nối → lệnh lỗi ngay
      maxRetriesPerRequest: 1, // lệnh đang chạy lúc đứt kết nối: lỗi sau 1 lần reconnect (mặc định 20)
      connectTimeout: 1000, // bằng timeout mỗi check của /ready (mặc định 10000ms)
    });
    // Không có listener 'error' thì Node coi là lỗi không bắt và kill process (giống pool ở plan 05).
    redis.on("error", (err) => {
      new Logger("Redis").error(`Redis client error: ${err.message}`);
    });
    return redis;
  },
} satisfies FactoryProvider<Redis>;

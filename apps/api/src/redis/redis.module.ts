import { Inject, Module, type OnApplicationShutdown } from "@nestjs/common";
import type { Redis } from "ioredis";
import { REDIS, redisProvider } from "./redis.provider.js";

@Module({
  providers: [redisProvider],
  exports: [REDIS],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  // quit() chờ lệnh đang chạy xong rồi đóng; disconnect() cắt ngay. Redis đã chết thì quit() lỗi → cắt luôn.
  async onApplicationShutdown() {
    try {
      await this.redis.quit();
    } catch {
      this.redis.disconnect();
    }
  }
}

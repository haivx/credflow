import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Redis } from "ioredis";
import { AppModule } from "../src/app.module.js";
import { REDIS } from "../src/redis/redis.provider.js";

describe("GET /ready (integration)", () => {
  // Khối 1: app với Postgres test và Redis thật.
  describe("Postgres và Redis đều chạy", () => {
    let app: INestApplication;

    beforeAll(async () => {
      const module = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();
      app = module.createNestApplication();
      await app.init();

      // Client tắt offline queue: lệnh gửi trước event "ready" lỗi ngay → chờ kết nối xong.
      const redis = app.get<Redis>(REDIS);
      if (redis.status !== "ready") {
        await new Promise((resolve) => redis.once("ready", resolve));
      }
    });

    afterAll(async () => {
      await app.close();
    });

    it("trả 200, db và redis đều up", async () => {
      const res = await request(app.getHttpServer()).get("/ready");
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        status: "ok",
        checks: { db: "up", redis: "up" },
      });
    });
  });

  // Khối 2: app riêng, REDIS bị thay TRƯỚC compile bằng client trỏ tới cổng không có Redis.
  describe("Redis không kết nối được", () => {
    let app: INestApplication;

    beforeAll(async () => {
      const module = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(REDIS)
        .useFactory({
          factory: () => {
            // Cùng option với redis.provider.ts, chỉ đổi cổng.
            const redis = new Redis("redis://localhost:6390", {
              enableOfflineQueue: false,
              maxRetriesPerRequest: 1,
              connectTimeout: 1000,
            });
            redis.on("error", () => {}); // tắt log lỗi reconnect cho đỡ ồn
            return redis;
          },
        })
        .compile();
      app = module.createNestApplication();
      await app.init();
    });

    // afterAll luôn chạy kể cả khi expect fail → không cần try/finally.
    afterAll(async () => {
      await app.close();
    });

    it("trả 503 trong dưới 1 giây, db vẫn up", async () => {
      const start = Date.now();
      const res = await request(app.getHttpServer()).get("/ready");
      const elapsed = Date.now() - start;

      expect(res.status).toBe(503);
      expect(res.body).toEqual({
        status: "error",
        checks: { db: "up", redis: "down" },
      });
      // < 1000ms: 503 đến từ đường lỗi nhanh (enableOfflineQueue: false), không phải từ timeout.
      expect(elapsed).toBeLessThan(1000);
    });
  });
});

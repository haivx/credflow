import { Test } from "@nestjs/testing";
import { describe, it, expect, vi, afterEach } from "vitest";
import { ReadyService } from "./ready.service.js";
import { DB } from "../db/db.provider.js";
import { REDIS } from "../redis/redis.provider.js";

async function createService(fakeDb: unknown, fakeRedis: unknown) {
  const module = await Test.createTestingModule({
    providers: [
      ReadyService,
      { provide: DB, useValue: fakeDb },
      { provide: REDIS, useValue: fakeRedis },
    ],
  }).compile();
  return module.get(ReadyService);
}

describe("ReadyService", () => {
  afterEach(() => {
    vi.useRealTimers();
  });
  it("cả DB và Redis trả lời thì status ok", async () => {
    const service = await createService(
      { execute: () => Promise.resolve() },
      { ping: () => Promise.resolve("PONG") },
    );
    expect(await service.check()).toEqual({
      status: "ok",
      checks: { db: "up", redis: "up" },
    });
  });

  it("Redis lỗi thì return error", async () => {
    const service = await createService(
      { execute: () => Promise.resolve() },
      { ping: () => Promise.reject(new Error("Redis is down")) },
    );
    expect(await service.check()).toEqual({
      status: "error",
      checks: { db: "up", redis: "down" },
    });
  });
  it("DB treo thì return down khi hết timeout", async () => {
    vi.useFakeTimers();
    const service = await createService(
      { execute: () => new Promise(() => {}) },
      { ping: () => Promise.resolve("PONG") },
    );
    const promise = service.check();
    await vi.advanceTimersByTimeAsync(1000);

    expect(await promise).toEqual({
      status: "error",
      checks: { db: "down", redis: "up" },
    });
  });
});

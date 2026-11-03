import { Inject, Injectable } from "@nestjs/common";
import { type Db, DB } from "../db/db.provider.js";
import { REDIS } from "../redis/redis.provider.js";
import { sql } from "drizzle-orm";
import type { Redis } from "ioredis";

const READY_TIMEOUT_MS = 1000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;

  // Promise "hẹn giờ": không bao giờ resolve, chỉ reject sau ms.
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms);
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timer) {
      clearTimeout(timer);
    }
  });
}

function toState(name: string, result: PromiseSettledResult<unknown>) {
  if (result.status === "rejected") {
    const message =
      result.reason instanceof Error
        ? result.reason.message
        : String(result.reason);
    const cause =
      result.reason instanceof Error && result.reason.cause instanceof Error
        ? ` (cause: ${result.reason.cause.message})`
        : "";
    console.error(`ready check failed: ${name}: ${message}${cause}`);
  }
  return result.status === "fulfilled" ? "up" : "down";
}

@Injectable()
export class ReadyService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  private checkDb() {
    return withTimeout(this.db.execute(sql`select 1`), READY_TIMEOUT_MS);
  }

  private checkRedis() {
    return withTimeout(this.redis.ping(), READY_TIMEOUT_MS);
  }

  async check() {
    const [db, redis] = await Promise.allSettled([
      this.checkDb(),
      this.checkRedis(),
    ]);

    const checks = { db: toState("db", db), redis: toState("redis", redis) };
    const status = checks.db === "up" && checks.redis === "up" ? "ok" : "error";
    return {
      status,
      checks,
    };
  }
}

import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cacheKey, type CacheEntry, EvalCache } from "./cache.js";

const SHA = "a".repeat(64);
const entry: CacheEntry = {
  classification: { docType: "tb_test", confidence: 0.9 },
  error: null,
  usage: { calls: 1, inputTokens: 1000, outputTokens: 20 },
  latencyMs: 900,
};

describe("cacheKey", () => {
  it("khác prompt version hoặc model thì khác khoá; khoá dùng được làm tên file", () => {
    const base = cacheKey(SHA, "classify@1+extract-cpr@1", "claude-haiku-5-5");
    expect(
      cacheKey(SHA, "classify@2+extract-cpr@1", "claude-haiku-5-5"),
    ).not.toBe(base);
    expect(
      cacheKey(SHA, "classify@1+extract-cpr@1", "claude-sonnet-5-5"),
    ).not.toBe(base);
    expect(base).toMatch(/^[a-z0-9._-]+$/);
  });
});

describe("EvalCache", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "eval-cache-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("miss rồi hit sau khi ghi", async () => {
    const cache = new EvalCache(dir);
    const key = cacheKey(SHA, "p@1", "m");
    expect(await cache.get(key)).toBeUndefined();
    await cache.set(key, entry);
    expect(await cache.get(key)).toEqual(entry);
  });

  it("file cache hỏng hoặc sai schema thì coi như miss", async () => {
    const cache = new EvalCache(dir);
    const key = cacheKey(SHA, "p@1", "m");
    await writeFile(join(dir, `${key}.json`), "{không phải json");
    expect(await cache.get(key)).toBeUndefined();
    await writeFile(join(dir, `${key}.json`), JSON.stringify({ usage: 1 }));
    expect(await cache.get(key)).toBeUndefined();
  });

  it("ghi không để lại file tạm", async () => {
    const cache = new EvalCache(join(dir, "sub"));
    await cache.set(cacheKey(SHA, "p@1", "m"), entry);
    expect(await readdir(join(dir, "sub"))).toHaveLength(1);
  });
});

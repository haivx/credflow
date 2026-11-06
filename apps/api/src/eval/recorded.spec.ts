import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CacheEntry } from "./cache.js";
import {
  inputPathFor,
  readRecorded,
  RecordedError,
  writeRecorded,
} from "./recorded.js";

const entry: CacheEntry = {
  classification: { docType: "tb_test", confidence: 0.9 },
  error: null,
  usage: { calls: 1, inputTokens: 1000, outputTokens: 20 },
  latencyMs: 900,
};
const meta = {
  promptVersion: "classify@1+extract-cpr@1",
  model: "claude-haiku-5-5",
  inputSha256: "a".repeat(64),
};

describe("inputPathFor", () => {
  it("synth: dùng HTML đã điền (giống byte mọi máy); hard-cases: dùng chính file", () => {
    expect(
      inputPathFor({
        id: "synth-cpr-0001",
        file: "data/synth/cpr/synth-cpr-0001.jpg",
      }),
    ).toBe("data/synth/cpr/synth-cpr-0001.html");
    expect(
      inputPathFor({
        id: "01-expires",
        file: "eval/hard-cases/cpr/01-expires.png",
      }),
    ).toBe("eval/hard-cases/cpr/01-expires.png");
  });
});

describe("recorded", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "eval-recorded-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("ghi rồi đọc lại đúng entry khi prompt, model, input khớp", async () => {
    await writeRecorded(dir, "c1", entry, meta);
    expect(await readRecorded(dir, "c1", meta)).toEqual(entry);
  });

  it("thiếu file: RecordedError nói rõ ca", async () => {
    await expect(readRecorded(dir, "c9", meta)).rejects.toThrow(RecordedError);
    await expect(readRecorded(dir, "c9", meta)).rejects.toThrow("c9");
  });

  it.each([
    ["promptVersion", { ...meta, promptVersion: "classify@2+extract-cpr@1" }],
    ["model", { ...meta, model: "claude-sonnet-5-5" }],
    ["inputSha256", { ...meta, inputSha256: "b".repeat(64) }],
  ])("%s khác lúc ghi: lỗi, phải ghi lại", async (field, current) => {
    await writeRecorded(dir, "c1", entry, meta);
    await expect(readRecorded(dir, "c1", current)).rejects.toThrow(field);
  });

  it("file hỏng hoặc sai schema: lỗi", async () => {
    await writeFile(join(dir, "c1.json"), "{hỏng");
    await expect(readRecorded(dir, "c1", meta)).rejects.toThrow(RecordedError);
  });

  it("ghi không để lại file tạm", async () => {
    await writeRecorded(join(dir, "sub"), "c1", entry, meta);
    expect(await readdir(join(dir, "sub"))).toEqual(["c1.json"]);
  });
});

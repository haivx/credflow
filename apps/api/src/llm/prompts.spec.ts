import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  loadAllPrompts,
  loadPrompt,
  PROMPT_VERSION,
  PROMPTS,
} from "./prompts.js";

describe("prompt (A12)", () => {
  it("mọi prompt khai trong PROMPTS đều có file và không rỗng", async () => {
    const texts = await loadAllPrompts();
    for (const key of Object.keys(PROMPTS) as (keyof typeof PROMPTS)[]) {
      expect(texts[key].trim().length).toBeGreaterThan(0);
    }
  });

  it("thiếu file thì lỗi, worker không khởi động được", async () => {
    const empty = await mkdtemp(join(tmpdir(), "credflow-prompts-"));
    try {
      await expect(loadAllPrompts(empty)).rejects.toThrow(/ENOENT/);
      await expect(loadPrompt("classify", 1, empty)).rejects.toThrow(/ENOENT/);
    } finally {
      await rm(empty, { recursive: true, force: true });
    }
  });

  it("versions.prompt ghi đủ tên và version", () => {
    expect(PROMPT_VERSION).toBe("classify@1+extract-cpr@1");
  });
});

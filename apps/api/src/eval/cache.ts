import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Classification, Extraction, parseJson } from "@credflow/contracts";
import * as z from "zod";

/** Kết quả LLM của một file, đủ để chấm lại rule mà không gọi LLM. */
export const CacheEntry = z.object({
  classification: Classification.optional(),
  extraction: Extraction.optional(),
  /** LLM lỗi không retry được (refusal, 4xx, output hỏng sau khi gọi lại). */
  error: z.string().nullable(),
  usage: z.object({
    calls: z.number().int().min(0),
    inputTokens: z.number().int().min(0),
    outputTokens: z.number().int().min(0),
  }),
  latencyMs: z.number().min(0),
});
export type CacheEntry = z.infer<typeof CacheEntry>;

/**
 * Khoá gồm nội dung file, prompt version và model. Không có `versions.rules`: đổi rule thì dùng
 * lại kết quả LLM, đó là mục đích. Đổi code gọi LLM mà không đổi prompt thì chạy `--no-cache`.
 */
export function cacheKey(
  sha256: string,
  promptVersion: string,
  model: string,
): string {
  const slug = (text: string) =>
    text.toLowerCase().replace(/[^a-z0-9.-]+/g, "_");
  return `${sha256}.${slug(promptVersion)}.${slug(model)}`;
}

export class EvalCache {
  constructor(private readonly dir: string) {}

  /** File thiếu, hỏng hoặc sai schema đều là miss: gọi LLM lại, không đoán. */
  async get(key: string): Promise<CacheEntry | undefined> {
    let text: string;
    try {
      text = await readFile(this.path(key), "utf8");
    } catch {
      return undefined;
    }
    try {
      return parseJson(CacheEntry, text);
    } catch {
      return undefined;
    }
  }

  /** Ghi ra file tạm rồi rename: bị ngắt giữa chừng không để lại file cache dở. */
  async set(key: string, entry: CacheEntry): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    const tmp = `${this.path(key)}.tmp`;
    await writeFile(tmp, `${JSON.stringify(entry, null, 2)}\n`);
    await rename(tmp, this.path(key));
  }

  private path(key: string): string {
    return join(this.dir, `${key}.json`);
  }
}

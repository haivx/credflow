import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseJson } from "@credflow/contracts";
import * as z from "zod";
import { CacheEntry } from "./cache.js";

/**
 * Output LLM đã ghi của một ca dev (plan 20), commit trong `eval/recorded/`. `make eval-ci` chấm lại
 * rule trên đó: không gọi LLM, không cần khoá. Ghi kèm prompt, model và sha256 input để biết khi
 * nào output đã cũ.
 */
export const RecordedOutput = CacheEntry.extend({
  promptVersion: z.string().min(1),
  model: z.string().min(1),
  inputSha256: z.string().regex(/^[0-9a-f]{64}$/),
});
export type RecordedOutput = z.infer<typeof RecordedOutput>;

export interface RecordedMeta {
  promptVersion: string;
  model: string;
  inputSha256: string;
}

export class RecordedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RecordedError";
  }
}

/**
 * File dùng để tính `inputSha256`. Ảnh synth khác byte giữa các máy (font), còn HTML đã điền thì
 * giống byte mọi nơi, nên synth dùng HTML; hard-cases commit sẵn file nên dùng chính file.
 */
export function inputPathFor(gc: { id: string; file: string }): string {
  if (gc.id.startsWith("synth-")) return gc.file.replace(/\.[a-z]+$/, ".html");
  return gc.file;
}

export async function writeRecorded(
  dir: string,
  id: string,
  entry: CacheEntry,
  meta: RecordedMeta,
): Promise<void> {
  await mkdir(dir, { recursive: true });
  const path = join(dir, `${id}.json`);
  const record: RecordedOutput = { ...meta, ...entry };
  await writeFile(`${path}.tmp`, `${JSON.stringify(record, null, 2)}\n`);
  await rename(`${path}.tmp`, path);
}

/** Ném `RecordedError` khi thiếu, hỏng, hoặc ghi với prompt/model/input khác hiện tại. */
export async function readRecorded(
  dir: string,
  id: string,
  current: RecordedMeta,
): Promise<CacheEntry> {
  let text: string;
  try {
    text = await readFile(join(dir, `${id}.json`), "utf8");
  } catch {
    throw new RecordedError(
      `${id}: chưa có output ghi sẵn, chạy make eval ARGS=--record`,
    );
  }
  let record: RecordedOutput;
  try {
    record = parseJson(RecordedOutput, text);
  } catch {
    throw new RecordedError(`${id}: file output ghi sẵn hỏng hoặc sai schema`);
  }
  for (const field of ["promptVersion", "model", "inputSha256"] as const) {
    if (record[field] !== current[field]) {
      throw new RecordedError(
        `${id}: ${field} khác lúc ghi (${record[field].slice(0, 24)} ≠ ${current[field].slice(0, 24)}), chạy make eval ARGS=--record`,
      );
    }
  }
  // CacheEntry bỏ các khoá lạ khi parse: trả đúng phần output LLM.
  return CacheEntry.parse(record);
}

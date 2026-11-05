import { readFile } from "node:fs/promises";
import { join } from "node:path";

/** Prompt và version đang dùng (A12). Đổi prompt = thêm file `<name>@<n+1>.md` rồi đổi số ở đây. */
export const PROMPTS = {
  classify: { name: "classify", version: 1 },
  extractCpr: { name: "extract-cpr", version: 1 },
} as const;

export type PromptTexts = Record<keyof typeof PROMPTS, string>;

/** Ghi vào `versions.prompt` để eval và audit biết kết quả sinh từ prompt nào. */
export const PROMPT_VERSION = Object.values(PROMPTS)
  .map(({ name, version }) => `${name}@${String(version)}`)
  .join("+");

// Cùng tương đối với file này ở cả src/ và dist/ (nest-cli.json copy *.md sang dist/prompts).
const PROMPTS_DIR = join(import.meta.dirname, "..", "prompts");

/** Cách duy nhất đọc prompt. */
export function loadPrompt(
  name: string,
  version: number,
  dir: string = PROMPTS_DIR,
): Promise<string> {
  return readFile(join(dir, `${name}@${String(version)}.md`), "utf8");
}

/** Nạp mọi prompt lúc worker khởi động: thiếu file thì không chạy, thay vì lỗi khi có job. */
export async function loadAllPrompts(
  dir: string = PROMPTS_DIR,
): Promise<PromptTexts> {
  const [classify, extractCpr] = await Promise.all([
    loadPrompt(PROMPTS.classify.name, PROMPTS.classify.version, dir),
    loadPrompt(PROMPTS.extractCpr.name, PROMPTS.extractCpr.version, dir),
  ]);
  return { classify, extractCpr };
}

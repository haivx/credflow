import { readFile, writeFile } from "node:fs/promises";
import { type Browser, chromium } from "playwright";
import { NOISE_MARGIN_PX, VIEWPORT } from "./fill.js";
import type { SynthCard } from "./scenarios.js";

/** Mốc giờ cố định ghi vào PDF thay cho giờ tạo thật. */
const PDF_FIXED_DATE = "20260101000000";

export class ChromiumMissingError extends Error {
  constructor() {
    super(
      "Chưa cài Chromium cho Playwright. Chạy: pnpm --filter @credflow/synth exec playwright install chromium",
    );
    this.name = "ChromiumMissingError";
  }
}

export async function launchBrowser(): Promise<Browser> {
  try {
    return await chromium.launch();
  } catch (err) {
    if (
      err instanceof Error &&
      err.message.includes("Executable doesn't exist")
    ) {
      throw new ChromiumMissingError();
    }
    throw err;
  }
}

/** Render một thẻ ra PNG, JPEG (có nhiễu) hoặc PDF (giấy chứng nhận). */
export async function renderCard(
  browser: Browser,
  card: SynthCard,
  html: string,
  outPath: string,
): Promise<void> {
  const base = VIEWPORT[card.layout];
  const margin = card.noise === null ? 0 : 2 * NOISE_MARGIN_PX;
  const page = await browser.newPage({
    viewport: { width: base.width + margin, height: base.height + margin },
    deviceScaleFactor: 1,
  });
  try {
    await page.setContent(html, { waitUntil: "load" });
    if (card.format === "pdf") {
      await page.pdf({
        path: outPath,
        width: "210mm",
        height: "297mm",
        printBackground: true,
      });
      await stripPdfDates(outPath);
    } else if (card.format === "jpg") {
      await page.screenshot({
        path: outPath,
        type: "jpeg",
        quality: card.noise?.jpegQuality ?? 70,
      });
    } else {
      await page.screenshot({ path: outPath, type: "png" });
    }
  } finally {
    await page.close();
  }
}

/**
 * Chromium ghi giờ tạo vào PDF, làm hai lần sinh cùng seed khác byte và cache eval trượt.
 * Thay bằng một mốc cố định cùng độ dài, nên vị trí byte trong bảng xref không đổi.
 */
async function stripPdfDates(path: string): Promise<void> {
  const bytes = await readFile(path);
  const text = bytes.toString("latin1");
  const fixed = text.replace(
    /\/(CreationDate|ModDate) \(([^)]*)\)/g,
    (_, key: string, value: string) => {
      let i = 0;
      // Chỉ thay chữ số, giữ dấu (D:, +, ', Z) và độ dài.
      const stable = value.replace(/\d/g, () => PDF_FIXED_DATE[i++] ?? "0");
      return `/${key} (${stable})`;
    },
  );
  if (fixed !== text) await writeFile(path, Buffer.from(fixed, "latin1"));
}

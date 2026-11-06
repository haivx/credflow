import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { GoldenCase } from "@credflow/contracts";
import { loadRulesConfig } from "@credflow/rules";
import { cardHtml } from "./fill.js";
import { ChromiumMissingError, launchBrowser, renderCard } from "./render.js";
import { buildCards, toGoldenCase } from "./scenarios.js";

// `make synth SEED=1` (plan 19): sinh thẻ CPR giả lập (watermark SAMPLE, tên và tổ chức hư cấu)
// + data/synth/cpr/cases.json. Cùng seed → cùng cases.json và HTML; ảnh giống byte trên cùng
// máy, cùng bản Chromium.

const ROOT = resolve(import.meta.dirname, "..", "..", "..");
const OUT_DIR = join(ROOT, "data", "synth", "cpr");

const { values: args } = parseArgs({
  options: {
    seed: { type: "string", default: "1" },
    // Plan 20: chỉ cases.json + HTML, không render, không cần Chromium (cho make eval-ci).
    "cases-only": { type: "boolean", default: false },
  },
});
const seed = Number(args.seed);
if (!Number.isInteger(seed) || seed < 0) {
  console.error("make synth: SEED phải là số nguyên ≥ 0");
  process.exit(1);
}

// Tổ chức "được chấp nhận" lấy từ config mặc định, để synth khớp với rule đang chạy.
const config = loadRulesConfig(join(ROOT, "config", "rules", "default.yaml"));
const accepted = config.acceptedIssuers.cpr_card ?? [];
const cards = buildCards(seed, accepted);
const cases = GoldenCase.array().parse(cards.map(toGoldenCase));

const casesText = `${JSON.stringify(cases, null, 2)}\n`;
const casesPath = join(OUT_DIR, "cases.json");

if (args["cases-only"]) {
  // Cùng bộ ca với lần sinh trước thì giữ nguyên ảnh đã render (máy dev); khác thì xoá để không
  // còn ảnh lệch với cases.json.
  const same =
    existsSync(casesPath) && (await readFile(casesPath, "utf8")) === casesText;
  if (!same) await rm(OUT_DIR, { recursive: true, force: true });
  await mkdir(OUT_DIR, { recursive: true });
  for (const card of cards) {
    await writeFile(join(OUT_DIR, `${card.id}.html`), cardHtml(card));
  }
  await writeFile(casesPath, casesText);
  console.log(
    `make synth --cases-only: seed ${String(seed)}, ${String(cards.length)} ca (cases.json + HTML, ${same ? "giữ ảnh cũ" : "chưa có ảnh"})`,
  );
  process.exit(0);
}

let browser;
try {
  browser = await launchBrowser();
} catch (err) {
  console.error(
    `make synth: ${err instanceof ChromiumMissingError ? err.message : String(err)}`,
  );
  process.exit(1);
}

// Chỉ xoá đúng thư mục này: cùng seed phải ra đúng bộ file, không lẫn file của seed cũ.
await rm(OUT_DIR, { recursive: true, force: true });
await mkdir(OUT_DIR, { recursive: true });

try {
  for (const [i, card] of cards.entries()) {
    const html = cardHtml(card);
    await writeFile(join(OUT_DIR, `${card.id}.html`), html);
    await renderCard(
      browser,
      card,
      html,
      join(OUT_DIR, `${card.id}.${card.format}`),
    );
    process.stdout.write(
      `\r[${String(i + 1)}/${String(cards.length)}] ${card.id}`,
    );
  }
} finally {
  await browser.close();
}
await writeFile(casesPath, casesText);

const count = (pick: (c: (typeof cards)[number]) => string) =>
  Object.entries(
    cards.reduce<Record<string, number>>((acc, c) => {
      acc[pick(c)] = (acc[pick(c)] ?? 0) + 1;
      return acc;
    }, {}),
  )
    .map(([k, v]) => `${k} ${String(v)}`)
    .join(", ");

console.log(
  `\nmake synth: seed ${String(seed)}, ${String(cards.length)} ca → data/synth/cpr/`,
);
console.log(`  kịch bản: ${count((c) => c.scenario)}`);
console.log(
  `  split: ${count((c) => c.split)} · bố cục: ${count((c) => c.layout)}`,
);

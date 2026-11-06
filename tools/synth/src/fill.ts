import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Layout, SynthCard } from "./scenarios.js";

export const LAYOUTS: readonly Layout[] = [
  "renewal-bar",
  "certificate",
  "wallet-validity",
  "valid-through",
];

/** Khung chụp cho từng bố cục (thẻ + padding 40px mỗi bên). */
export const VIEWPORT: Record<Layout, { width: number; height: number }> = {
  "renewal-bar": { width: 800, height: 510 },
  certificate: { width: 794, height: 1090 },
  "wallet-validity": { width: 680, height: 440 },
  "valid-through": { width: 440, height: 640 },
};

/** Lề thêm quanh thẻ có nhiễu, để thẻ xoay/nghiêng không bị cắt mép khi chụp. */
export const NOISE_MARGIN_PX = 60;

const TEMPLATE_DIR = join(import.meta.dirname, "..", "templates", "cpr");

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => ESCAPES[ch] ?? ch);
}

/**
 * Điền `{{key}}` bằng giá trị đã escape. Placeholder thiếu giá trị, hoặc giá trị không có
 * placeholder, đều là lỗi: template và dữ liệu lệch nhau thì thẻ sẽ thiếu chữ mà không ai biết.
 */
export function fillTemplate(
  template: string,
  values: Record<string, string>,
): string {
  const used = new Set<string>();
  const html = template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const value = values[key];
    if (value === undefined) throw new Error(`Thiếu giá trị cho {{${key}}}`);
    used.add(key);
    return escapeHtml(value);
  });
  const unused = Object.keys(values).filter((key) => !used.has(key));
  if (unused.length > 0) {
    throw new Error(`Template không có chỗ cho: ${unused.join(", ")}`);
  }
  return html;
}

/** HTML đầy đủ của một thẻ: template đã điền + style nhiễu (nếu có). */
export function cardHtml(card: SynthCard): string {
  const template = readFileSync(
    join(TEMPLATE_DIR, `${card.layout}.html`),
    "utf8",
  );
  const { printed } = card;
  const values: Record<string, string> = {
    holderName: printed.holderName,
    issuerName: printed.issuerName,
    courseType: printed.courseType,
    cardNumber: printed.cardNumber,
    completionText: printed.completionText,
  };
  if (printed.expiryText !== null) values.expiryText = printed.expiryText;
  if (printed.validityText !== null) values.validityText = printed.validityText;

  const html = fillTemplate(template, values);
  if (card.noise === null) return html;
  const n = card.noise;
  // Như ảnh chụp thẻ đặt trên mặt bàn: nền xám, thẻ xoay/nghiêng/mờ.
  return `${html}
<style id="synth-noise">
  body { background: #cfc8bb; padding: ${String(NOISE_MARGIN_PX + 40)}px; }
  #card { transform-origin: center; transform: perspective(900px) rotateX(${String(n.tiltXDeg)}deg) rotateY(${String(n.tiltYDeg)}deg) rotate(${String(n.rotateDeg)}deg); filter: blur(${String(n.blurPx)}px); }
</style>
`;
}

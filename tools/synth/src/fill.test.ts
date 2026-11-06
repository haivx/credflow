import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { cardHtml, fillTemplate, LAYOUTS } from "./fill.js";
import { buildCards } from "./scenarios.js";

describe("fillTemplate", () => {
  it("điền giá trị đã escape HTML", () => {
    expect(
      fillTemplate("<p>{{holderName}}</p>", {
        holderName: `<script>alert("x")</script> & O'Neil`,
      }),
    ).toBe(
      "<p>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; O&#39;Neil</p>",
    );
  });

  it("placeholder không có giá trị → lỗi", () => {
    expect(() => fillTemplate("{{a}} {{b}}", { a: "1" })).toThrow("b");
  });

  it("giá trị không có placeholder → lỗi (template và dữ liệu lệch nhau)", () => {
    expect(() => fillTemplate("{{a}}", { a: "1", c: "2" })).toThrow("c");
  });
});

describe("template CPR", () => {
  const cards = buildCards(1, [
    "Lifeline Response Institute",
    "Northbridge Safety Council",
  ]);

  it("mỗi bố cục có watermark SAMPLE và khung #card", () => {
    for (const layout of LAYOUTS) {
      const html = readFileSync(
        join(import.meta.dirname, "..", "templates", "cpr", `${layout}.html`),
        "utf8",
      );
      expect(html, layout).toContain(">SAMPLE<");
      expect(html, layout).toContain('id="card"');
    }
  });

  it("mọi thẻ điền được; HTML có tên in trên thẻ, watermark; thẻ nhiễu có style nhiễu", () => {
    for (const card of cards) {
      const html = cardHtml(card);
      expect(html, card.id).toContain(">SAMPLE<");
      expect(html, card.id).toContain(
        card.printed.holderName.replace(/'/g, "&#39;"),
      );
      expect(html.includes("synth-noise"), card.id).toBe(card.noise !== null);
    }
  });

  it("cùng seed → HTML giống hệt", () => {
    const again = buildCards(1, [
      "Lifeline Response Institute",
      "Northbridge Safety Council",
    ]);
    expect(again.map(cardHtml)).toEqual(cards.map(cardHtml));
  });
});

import { GoldenCase } from "@credflow/contracts";
import { describe, expect, it } from "vitest";
import { buildCards, toGoldenCase } from "./scenarios.js";

const ACCEPTED = ["Lifeline Response Institute", "Northbridge Safety Council"];
const AS_OF = "2026-11-06";

const cards = buildCards(1, ACCEPTED);
const cases = cards.map(toGoldenCase);

describe("buildCards", () => {
  it("40 ca, id liên tục, cùng seed giống hệt, seed khác thì khác", () => {
    expect(cards).toHaveLength(40);
    expect(cards.map((c) => c.id)).toEqual(
      Array.from(
        { length: 40 },
        (_, i) => `synth-cpr-${String(i + 1).padStart(4, "0")}`,
      ),
    );
    expect(buildCards(1, ACCEPTED)).toEqual(cards);
    expect(buildCards(2, ACCEPTED)).not.toEqual(cards);
  });

  it("30 dev / 10 holdout; holdout có cả hai decision, mỗi kịch bản tối đa 1 ca holdout", () => {
    const holdout = cases.filter((c) => c.split === "holdout");
    expect(holdout).toHaveLength(10);
    expect(new Set(holdout.map((c) => c.expected.decision))).toEqual(
      new Set(["auto_approve", "needs_review"]),
    );
    const kinds = cards
      .filter((c) => c.split === "holdout")
      .map((c) => c.scenario);
    expect(new Set(kinds).size).toBe(kinds.length);
  });

  it("mọi ca parse được bằng GoldenCase, asOf cố định, file theo id", () => {
    for (const gc of cases) {
      expect(GoldenCase.safeParse(gc).success, gc.id).toBe(true);
      expect(gc.asOf).toBe(AS_OF);
      expect(gc.file).toMatch(
        new RegExp(`^data/synth/cpr/${gc.id}\\.(png|jpg|pdf)$`),
      );
    }
  });

  it("thẻ có nhiễu xuất ảnh JPEG; thẻ sạch không có nhiễu", () => {
    for (const card of cards) {
      const noisy = ["rotated", "blurred", "skewed"].includes(card.scenario);
      expect(card.noise !== null, card.id).toBe(noisy);
      if (noisy) expect(card.format, card.id).toBe("jpg");
    }
  });
});

describe("sự thật của từng kịch bản (so với asOf)", () => {
  const byKind = (kind: string) => cards.filter((c) => c.scenario === kind);

  it("còn hạn > 30 ngày với thẻ sạch; ≤ 30 ngày với expiring_soon; đã hết hạn với expired", () => {
    for (const c of byKind("clean"))
      expect(c.truth.expirationDate > "2026-12-06", c.id).toBe(true);
    for (const c of byKind("expiring_soon")) {
      expect(c.truth.expirationDate > AS_OF, c.id).toBe(true);
      expect(c.truth.expirationDate <= "2026-12-06", c.id).toBe(true);
    }
    for (const c of byKind("expired"))
      expect(c.truth.expirationDate < AS_OF, c.id).toBe(true);
  });

  it("hạn = ngày học + 24 tháng", () => {
    for (const c of cards) {
      const [y, m, d] = c.truth.completionDate.split("-").map(Number);
      expect(c.truth.expirationDate, c.id).toBe(
        `${String((y ?? 0) + 2)}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
      );
    }
  });

  it("tổ chức: issuer_not_accepted không nằm trong danh sách, các kịch bản khác thì có", () => {
    for (const c of cards) {
      expect(ACCEPTED.includes(c.printed.issuerName), c.id).toBe(
        c.scenario !== "issuer_not_accepted",
      );
    }
  });

  it("tên: thẻ sạch in đúng legalName; other_person in tên không phải của staff", () => {
    for (const c of byKind("clean"))
      expect(c.printed.holderName).toBe(c.staff.legalName);
    for (const c of byKind("other_person")) {
      expect(c.printed.holderName).not.toBe(c.staff.legalName);
      expect(c.staff.aliases).not.toContain(c.printed.holderName);
    }
  });

  it("ngày không mơ hồ: ngày trong tháng > 12 trừ kịch bản ambiguous_date (ngày và tháng đều ≤ 12, khác nhau)", () => {
    for (const c of cards) {
      const [, m, d] = c.truth.completionDate.split("-").map(Number);
      if (c.scenario === "ambiguous_date") {
        expect((d ?? 0) <= 12 && (m ?? 0) <= 12 && d !== m, c.id).toBe(true);
      } else {
        expect(d ?? 0, c.id).toBeGreaterThan(12);
      }
    }
  });
});

describe("toGoldenCase: đáp án trường theo bố cục", () => {
  it("wallet-validity: không có hạn in, validityText là câu in trên thẻ", () => {
    const gc = cases.find(
      (c) => cards.find((k) => k.id === c.id)?.layout === "wallet-validity",
    );
    expect(gc?.expected.fields.expirationDate).toBeNull();
    expect(gc?.expected.fields.validityText).toBe(
      "Valid 2 years from the date of completion.",
    );
  });

  it("valid-through: không so expirationDate lẫn validityText", () => {
    const gc = cases.find(
      (c) => cards.find((k) => k.id === c.id)?.layout === "valid-through",
    );
    expect(gc?.expected.fields).not.toHaveProperty("expirationDate");
    expect(gc?.expected.fields).not.toHaveProperty("validityText");
  });

  it("ambiguous_date: đáp án ngày là null", () => {
    for (const card of cards.filter((c) => c.scenario === "ambiguous_date")) {
      const gc = toGoldenCase(card);
      expect(gc.expected.fields.completionDate).toBeNull();
    }
  });

  it("holderName là chuỗi in trên thẻ", () => {
    for (const card of cards)
      expect(toGoldenCase(card).expected.fields.holderName).toBe(
        card.printed.holderName,
      );
  });
});

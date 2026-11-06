import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { expectedDecision, SCENARIOS } from "./policy.js";

// Bảng kịch bản Liam duyệt ở plan 19. Sửa ở đây là đổi chính sách, phải qua plan.
const TABLE = {
  clean: ["auto_approve", 8, ["clean"]],
  rotated: ["auto_approve", 3, ["rotated"]],
  blurred: ["auto_approve", 3, ["blurred"]],
  skewed: ["auto_approve", 3, ["skewed_photo"]],
  expiring_soon: ["auto_approve", 2, ["clean"]],
  expired: ["needs_review", 4, ["expired"]],
  issuer_not_accepted: ["needs_review", 4, ["issuer_not_accepted"]],
  name_variant_ok: ["auto_approve", 3, ["name_variant"]],
  name_variant_bad: ["needs_review", 2, ["name_variant"]],
  other_person: ["needs_review", 2, ["name_variant"]],
  validity_text: ["auto_approve", 2, ["no_printed_expiry"]],
  month_only: ["needs_review", 2, ["no_printed_expiry"]],
  ambiguous_date: ["needs_review", 2, ["date_format_ambiguous"]],
} as const;

describe("chính sách đáp án", () => {
  it("đúng bảng: decision, số ca, tag", () => {
    for (const [kind, [decision, count, tags]] of Object.entries(TABLE)) {
      const scenario = SCENARIOS.find((s) => s.kind === kind);
      expect(scenario, kind).toBeDefined();
      expect(expectedDecision(scenario?.kind ?? "clean"), kind).toBe(decision);
      expect(scenario?.count, kind).toBe(count);
      expect(scenario?.tags, kind).toEqual(tags);
    }
    expect(SCENARIOS).toHaveLength(Object.keys(TABLE).length);
  });

  it("tổng 40 ca", () => {
    expect(SCENARIOS.reduce((sum, s) => sum + s.count, 0)).toBe(40);
  });

  it("policy.ts không import rule engine (đáp án phải độc lập với thứ được đo)", () => {
    const source = readFileSync(join(import.meta.dirname, "policy.ts"), "utf8");
    expect(source).not.toMatch(/from\s+["']@credflow\/rules["']/);
    expect(source).not.toMatch(/evaluateRules|route\(/);
  });
});

describe("mã nguồn synth", () => {
  it("không dùng Math.random (mọi random đi qua rng có seed)", () => {
    for (const file of [
      "rng.ts",
      "policy.ts",
      "names.ts",
      "scenarios.ts",
      "fill.ts",
      "render.ts",
      "generate.ts",
    ]) {
      const source = readFileSync(join(import.meta.dirname, file), "utf8");
      expect(source, file).not.toContain("Math.random");
    }
  });
});

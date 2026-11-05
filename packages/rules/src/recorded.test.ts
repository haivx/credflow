import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Extraction, parseJson, type StaffProfile } from "@credflow/contracts";
import { evaluateRules, loadRulesConfig, route } from "./index.js";

// Output thật của claude-haiku-5-5 trên fixture SAMPLE (plan 14), chạy qua config mặc định.
const ROOT = join(import.meta.dirname, "..", "..", "..");
const config = loadRulesConfig(join(ROOT, "config", "rules", "default.yaml"));

const staffNamed = (legalName: string): StaffProfile => ({
  id: "s1",
  legalName,
  aliases: [],
  role: "caregiver",
  clientIds: [],
  region: "CA",
});

function evaluate(fixture: string, legalName: string) {
  const extraction = parseJson(
    Extraction,
    readFileSync(
      join(ROOT, "eval", "hard-cases", "cpr", "recorded", `${fixture}.json`),
      "utf8",
    ),
  );
  const results = evaluateRules({
    extraction,
    classification: { docType: "cpr_card", confidence: 0.97 },
    staff: staffNamed(legalName),
    config,
    asOf: "2026-11-05",
  });
  return {
    failed: results.filter((r) => !r.passed).map((r) => r.code),
    decision: route(results).decision,
  };
}

describe("output thật của Haiku", () => {
  it.each([
    ["01-expires", "Marisol Quennell", [], "auto_approve"],
    [
      "02-valid-2-years",
      "Tobias Arkwright-Lenz",
      ["MISSING_FIELD", "EXPIRED"],
      "needs_review",
    ],
    [
      "03-renewal-month",
      "Marisol Quennell",
      ["LOW_CONFIDENCE"],
      "needs_review",
    ],
    ["05-injection", "Odalys Venn", ["ISSUER_NOT_ACCEPTED"], "needs_review"],
  ])("%s", (fixture, legalName, failed, decision) => {
    expect(evaluate(fixture, legalName)).toEqual({ failed, decision });
  });

  it("đúng thẻ nhưng sai người thì không tự duyệt", () => {
    expect(evaluate("01-expires", "Odalys Venn")).toEqual({
      failed: ["NAME_MISMATCH"],
      decision: "needs_review",
    });
  });
});

import { expect, it, vi } from "vitest";
import { evaluateRules, route } from "./index.js";

// Giả lập registry có mã mà chưa có code chấm: không được coi là qua.
vi.mock("./cpr.js", () => ({ evaluateCpr: () => ({}) }));

it("rule trong registry chưa có code chấm thì không qua, không tự duyệt", () => {
  const empty = { value: null, confidence: 0, evidence: null };
  const results = evaluateRules({
    extraction: {
      docType: "cpr_card",
      fields: {
        holderName: empty,
        issuerName: empty,
        courseType: empty,
        completionDate: empty,
        expirationDate: empty,
        validityText: empty,
        cardNumber: empty,
      },
    },
    classification: { docType: "cpr_card", confidence: 0.97 },
    staff: {
      id: "s1",
      legalName: "Maren Ostrowe",
      aliases: [],
      role: "caregiver",
      clientIds: [],
      region: "CA",
    },
    config: {
      version: 1,
      minFieldConfidence: 0.85,
      expiringSoonDays: 30,
      roles: {},
      defaultValidityMonths: {},
      acceptedIssuers: {},
    },
    asOf: "2026-11-05",
  });

  expect(results.length).toBeGreaterThan(0);
  expect(results.every((r) => !r.passed)).toBe(true);
  expect(route(results).decision).toBe("needs_review");
});

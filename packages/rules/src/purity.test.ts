import { afterEach, describe, expect, it, vi } from "vitest";
import type { RuleResult } from "@credflow/contracts";
import { evaluateRules, type RuleInput, route } from "./index.js";

// A3 (docs/agent/GUARDRAILS.md): kiểm lúc chạy rằng engine là hàm thuần, bổ sung cho lint.

/** Freeze cả object lồng nhau: hàm nào sửa input sẽ throw TypeError (ESM luôn strict mode). */
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

const results = (): RuleResult[] => [
  {
    code: "EXPIRED",
    passed: true,
    severity: "block",
    message: "",
    fieldRefs: ["expirationDate"],
  },
  {
    code: "NAME_MISMATCH",
    passed: false,
    severity: "block",
    message: "",
    fieldRefs: ["holderName"],
  },
  {
    code: "EXPIRING_SOON",
    passed: false,
    severity: "info",
    message: "",
    fieldRefs: [],
  },
];

describe("route() thuần", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("cùng input → cùng output", () => {
    expect(route(results())).toEqual(route(results()));
  });

  it("không sửa input", () => {
    const input = deepFreeze(results());
    expect(() => route(input)).not.toThrow();
    expect(input).toEqual(results());
  });

  // Input toàn rule qua: kết quả là auto_approve, nên đồng hồ len vào điều kiện nào cũng lộ ra.
  it("đổi đồng hồ hệ thống không đổi kết quả", () => {
    const allPass = () => results().map((r) => ({ ...r, passed: true }));
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2020-01-01T00:00:00Z"));
    const before = route(allPass());
    vi.setSystemTime(new Date("2099-12-31T23:59:59Z"));
    expect(route(allPass())).toEqual(before);
  });
});

describe("evaluateRules() thuần", () => {
  const field = (value: string) => ({
    value,
    confidence: 0.95,
    evidence: { quote: value },
  });
  const input = (): RuleInput => ({
    extraction: {
      docType: "cpr_card",
      fields: {
        holderName: field("Maren Ostrowe"),
        issuerName: field("Northbridge Safety Council"),
        courseType: field("Adult CPR"),
        completionDate: field("2026-03-14"),
        expirationDate: { value: null, confidence: 0, evidence: null },
        validityText: field("Valid 2 years"),
        cardNumber: { value: null, confidence: 0, evidence: null },
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
      defaultValidityMonths: { cpr_card: 24 },
      acceptedIssuers: { cpr_card: ["Northbridge Safety Council"] },
    },
    asOf: "2026-11-05",
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("cùng input → cùng output", () => {
    expect(evaluateRules(input())).toEqual(evaluateRules(input()));
  });

  it("không sửa input đã deep-freeze", () => {
    const frozen = deepFreeze(input());
    expect(() => evaluateRules(frozen)).not.toThrow();
    expect(frozen).toEqual(input());
  });

  it("đổi đồng hồ hệ thống không đổi kết quả khi asOf giữ nguyên", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2020-01-01T00:00:00Z"));
    const before = evaluateRules(input());
    vi.setSystemTime(new Date("2099-12-31T23:59:59Z"));
    expect(evaluateRules(input())).toEqual(before);
  });
});

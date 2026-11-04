import { afterEach, describe, expect, it, vi } from "vitest";
import type { RuleResult } from "@credflow/contracts";
import { route } from "./index.js";

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

// Bật khi CPR rule có code (evaluateRules hiện còn throw "Chưa hiện thực").
describe("evaluateRules() thuần", () => {
  it.todo("cùng input → cùng output");
  it.todo("không sửa input đã deep-freeze");
  it.todo("đổi đồng hồ hệ thống không đổi kết quả khi asOf giữ nguyên");
});

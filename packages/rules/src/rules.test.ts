import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { RuleResult } from "@credflow/contracts";
import { loadRulesConfig, route } from "./index";

const CONFIG = join(
  import.meta.dirname,
  "..",
  "..",
  "..",
  "config",
  "rules",
  "default.yaml",
);

describe("config", () => {
  it("default.yaml đúng schema RulesConfig", () => {
    const config = loadRulesConfig(CONFIG);
    expect(config.roles.caregiver?.required).toContain("cpr_card");
  });
});

describe("route", () => {
  const pass: RuleResult = {
    code: "EXPIRED",
    passed: true,
    severity: "block",
    message: "",
    fieldRefs: [],
  };

  it("mọi rule block đều qua → auto_approve", () => {
    expect(route([pass]).decision).toBe("auto_approve");
  });

  it("một rule block không qua → needs_review kèm lý do", () => {
    const fail: RuleResult = { ...pass, code: "NAME_MISMATCH", passed: false };
    expect(route([pass, fail])).toEqual({
      decision: "needs_review",
      reasons: ["NAME_MISMATCH"],
    });
  });

  it("rule info không qua vẫn được tự duyệt", () => {
    const info: RuleResult = {
      ...pass,
      code: "EXPIRING_SOON",
      passed: false,
      severity: "info",
    };
    expect(route([pass, info]).decision).toBe("auto_approve");
  });
});

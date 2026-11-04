import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadRulesConfig } from "./config.js";
import { assertRulesReady, type RuleRegistry } from "./ready.js";
import { RULES_BY_DOC_TYPE } from "./registry.js";

const CONFIG = loadRulesConfig(
  join(
    import.meta.dirname,
    "..",
    "..",
    "..",
    "config",
    "rules",
    "default.yaml",
  ),
);

describe("assertRulesReady", () => {
  it("registry thật + default.yaml → không throw", () => {
    expect(() => assertRulesReady(CONFIG)).not.toThrow();
  });

  it("loại giấy được roles yêu cầu mà không có rule block → throw, nêu tên loại", () => {
    const registry: RuleRegistry = {
      ...RULES_BY_DOC_TYPE,
      tb_test: [{ code: "EXPIRING_SOON", severity: "info" }],
    };
    expect(() => assertRulesReady(CONFIG, registry)).toThrow(/tb_test/);
  });

  it("loại giấy được roles yêu cầu mà thiếu hẳn trong registry → throw", () => {
    const registry: RuleRegistry = { ...RULES_BY_DOC_TYPE };
    delete registry.background_check;
    expect(() => assertRulesReady(CONFIG, registry)).toThrow(
      /background_check/,
    );
  });

  it("mã rule trùng trong một loại giấy → throw, nêu mã", () => {
    const registry: RuleRegistry = {
      ...RULES_BY_DOC_TYPE,
      cpr_card: [
        ...RULES_BY_DOC_TYPE.cpr_card,
        { code: "EXPIRED", severity: "block" },
      ],
    };
    expect(() => assertRulesReady(CONFIG, registry)).toThrow(
      /cpr_card.*EXPIRED/,
    );
  });

  it("gom mọi lỗi vào một lần throw", () => {
    const registry: RuleRegistry = {
      ...RULES_BY_DOC_TYPE,
      tb_test: [],
      cpr_card: [
        { code: "EXPIRED", severity: "block" },
        { code: "EXPIRED", severity: "block" },
      ],
    };
    expect(() => assertRulesReady(CONFIG, registry)).toThrow(
      /tb_test[\s\S]*cpr_card|cpr_card[\s\S]*tb_test/,
    );
  });
});

describe("RULES_BY_DOC_TYPE", () => {
  it("không loại giấy nào khai NO_RULES_EVALUATED (mã hệ thống, chỉ route() trả)", () => {
    for (const rules of Object.values(RULES_BY_DOC_TYPE)) {
      expect(rules.map((r) => r.code)).not.toContain("NO_RULES_EVALUATED");
    }
  });
});

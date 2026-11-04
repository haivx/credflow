import type { DocType, RuleCode, RuleResult } from "@credflow/contracts";

export interface RuleDef {
  code: RuleCode;
  severity: RuleResult["severity"];
}

// Severity cố định theo docs/product.md mục 5, không cấu hình theo khách hàng (plan 12c, phương án A).
const COMMON: readonly RuleDef[] = [
  { code: "WRONG_DOC_TYPE", severity: "block" },
  { code: "MISSING_FIELD", severity: "block" },
  { code: "MISSING_EVIDENCE", severity: "block" },
  { code: "LOW_CONFIDENCE", severity: "block" },
  { code: "DATE_INCONSISTENT", severity: "block" },
  { code: "NAME_MISMATCH", severity: "block" },
  // Loại không in hạn thì tự tính từ defaultValidityMonths.
  { code: "EXPIRED", severity: "block" },
  { code: "EXPIRING_SOON", severity: "info" },
];

const ISSUER: RuleDef = { code: "ISSUER_NOT_ACCEPTED", severity: "block" };
const RESULT: RuleDef = { code: "RESULT_NOT_PASSING", severity: "block" };

/** Rule áp cho từng loại giấy. evaluateRules chấm đúng tập này; assertRulesReady kiểm lúc khởi động. */
export const RULES_BY_DOC_TYPE: Record<DocType, readonly RuleDef[]> = {
  cpr_card: [...COMMON, ISSUER],
  professional_license: [...COMMON, ISSUER],
  tb_test: [...COMMON, RESULT],
  background_check: [...COMMON, RESULT],
  vaccination_record: COMMON,
  unknown: [{ code: "WRONG_DOC_TYPE", severity: "block" }],
};

import type {
  Extraction,
  RoutingDecision,
  RuleResult,
  RulesConfig,
  StaffProfile,
} from "@credflow/contracts";

/**
 * Rule engine: hàm thuần, deterministic, không gọi LLM, không đọc file.
 * Hiện thực ở P1 (CPR) và P3 (đủ rule). Xem docs/product.md mục 5.
 */
export interface RuleInput {
  extraction: Extraction;
  staff: StaffProfile;
  config: RulesConfig;
  /** "Hôm nay" dạng YYYY-MM-DD, truyền vào để test và eval tái lập được. */
  asOf: string;
}

export function evaluateRules(input: RuleInput): RuleResult[] {
  throw new Error(`Chưa hiện thực (P1): ${input.extraction.docType}`);
}

/** Chỉ tự duyệt khi mọi rule `block` đều qua. Không có rule nào được chấm → không tự duyệt. */
export function route(results: RuleResult[]): RoutingDecision {
  if (results.length === 0) {
    return { decision: "needs_review", reasons: ["NO_RULES_EVALUATED"] };
  }
  const reasons = results
    .filter((r) => r.severity === "block" && !r.passed)
    .map((r) => r.code);
  return reasons.length === 0
    ? { decision: "auto_approve", reasons: [] }
    : { decision: "needs_review", reasons };
}

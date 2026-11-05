import type {
  Classification,
  DocType,
  Extraction,
  RoutingDecision,
  RuleResult,
  RulesConfig,
  StaffProfile,
} from "@credflow/contracts";
import { evaluateCpr } from "./cpr.js";
import { isRealDate } from "./dates.js";
import { RULES_BY_DOC_TYPE } from "./registry.js";

/**
 * Rule engine: hàm thuần, deterministic, không gọi LLM, không đọc file.
 * CPR từ plan 15; các loại khác ở P3, P5. Xem docs/product.md mục 5.
 */
export interface RuleInput {
  extraction: Extraction;
  classification: Classification;
  /** Loại giấy nhân viên khai lúc upload, có thể không khai. */
  declaredDocType?: DocType | undefined;
  staff: StaffProfile;
  config: RulesConfig;
  /** "Hôm nay" dạng YYYY-MM-DD, truyền vào để test và eval tái lập được. */
  asOf: string;
}

/**
 * Chấm đúng tập rule trong registry. Loại giấy chưa có rule thì trả rỗng, `route` ra
 * NO_RULES_EVALUATED nên không có đường tới auto_approve.
 */
export function evaluateRules(input: RuleInput): RuleResult[] {
  if (!isRealDate(input.asOf)) {
    throw new Error("asOf không phải ngày hợp lệ");
  }
  const { extraction } = input;
  if (extraction.docType !== "cpr_card") return [];

  const checks = evaluateCpr({ ...input, fields: extraction.fields });
  return RULES_BY_DOC_TYPE.cpr_card.map(({ code, severity }) => {
    // Registry có mã mà chưa có code chấm thì không được coi là qua.
    const check = checks[code] ?? {
      passed: false,
      message: "Rule chưa được hiện thực",
      fieldRefs: [],
    };
    return { code, severity, ...check };
  });
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

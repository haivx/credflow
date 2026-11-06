import {
  type Classification,
  type DocType,
  type Extraction,
  type RoutingDecision,
  type RuleResult,
  RulesConfig,
  type RulesConfigInput,
  type StaffProfile,
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
  /** Config như trong file; `name`, `dateOrder` bỏ trống thì lấy mặc định (plan 25). */
  config: RulesConfigInput;
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

  // Parse để có giá trị mặc định (`dateOrder` = strict); config sai thì ném lỗi, không chấm bừa.
  const config = RulesConfig.parse(input.config);
  const checks = evaluateCpr({ ...input, config, fields: extraction.fields });
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

/**
 * Chấm theo nhiều config (plan 25: mọi khách hàng của staff) và gộp chặt nhất: một rule chỉ qua khi
 * qua ở **mọi** config. Rule không qua lấy message của config đầu tiên không qua, kèm tên config khi
 * có hơn một config. Một config → y như `evaluateRules`.
 */
export function evaluateRulesForConfigs(
  input: Omit<RuleInput, "config">,
  configs: readonly RulesConfigInput[],
): RuleResult[] {
  const first = configs[0];
  if (first === undefined)
    throw new Error("Cần ít nhất một config để chấm rule");
  if (configs.length === 1) return evaluateRules({ ...input, config: first });

  const perConfig = configs.map((config) => ({
    name: RulesConfig.parse(config).name,
    results: evaluateRules({ ...input, config }),
  }));
  const base = perConfig[0]?.results ?? [];
  return base.map((rule, i) => {
    const failing = perConfig.find(
      ({ results }) => results[i]?.passed === false,
    );
    if (failing === undefined) return rule;
    const failed = failing.results[i] ?? rule;
    return { ...failed, message: `[${failing.name}] ${failed.message}` };
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

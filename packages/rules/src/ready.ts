import type { DocType, RulesConfig } from "@credflow/contracts";
import { RULES_BY_DOC_TYPE, type RuleDef } from "./registry.js";

export type RuleRegistry = Partial<Record<DocType, readonly RuleDef[]>>;

/**
 * Kiểm bộ rule trước khi chạy: mỗi loại giấy mà `roles` yêu cầu có ít nhất một rule `block`,
 * và mã rule trong mỗi loại là duy nhất. Sai thì throw một lần, liệt kê mọi lỗi, để app không khởi động.
 */
export function assertRulesReady(
  config: RulesConfig,
  registry: RuleRegistry = RULES_BY_DOC_TYPE,
): void {
  const problems: string[] = [];

  const required = new Set(
    Object.values(config.roles).flatMap((role) => role.required),
  );
  for (const docType of required) {
    const rules = registry[docType] ?? [];
    if (!rules.some((r) => r.severity === "block")) {
      problems.push(`${docType}: không có rule block nào`);
    }
  }

  for (const [docType, rules] of Object.entries(registry)) {
    const seen = new Set<string>();
    for (const { code } of rules) {
      if (seen.has(code)) problems.push(`${docType}: mã rule trùng ${code}`);
      seen.add(code);
    }
  }

  if (problems.length > 0) {
    throw new Error(`Bộ rule không hợp lệ:\n- ${problems.join("\n- ")}`);
  }
}

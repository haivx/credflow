import {
  DocType,
  RulesConfig,
  type RulesConfigInput,
} from "@credflow/contracts";

/**
 * Loại giấy vai trò `role` phải có theo các config (plan 26): hợp `roles[role].required`, sắp theo
 * thứ tự `DocType`. Config không có vai trò này không thêm gì; không config nào có → `undefined`
 * (phía gọi trả `unknown_role`, không bao giờ coi là đủ).
 */
export function requiredDocTypes(
  configs: readonly RulesConfigInput[],
  role: string,
): DocType[] | undefined {
  const required = new Set<DocType>();
  let known = false;
  for (const input of configs) {
    const forRole = RulesConfig.parse(input).roles[role];
    if (forRole === undefined) continue;
    known = true;
    for (const docType of forRole.required) required.add(docType);
  }
  if (!known) return undefined;
  return DocType.options.filter((docType) => required.has(docType));
}

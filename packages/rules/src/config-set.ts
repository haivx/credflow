import type { RulesConfig } from "@credflow/contracts";

/** Config mặc định + config theo khách hàng, khoá là `clientId` (plan 25). */
export interface RulesConfigSet {
  default: RulesConfig;
  byClient: Record<string, RulesConfig>;
}

/**
 * Config dùng để chấm giấy của một staff: config của từng khách hàng của staff; khách hàng chưa có
 * file thì dùng `default`; staff không có khách hàng → `[default]`. Bỏ trùng, sắp theo `name` để
 * kết quả và `versions.rules` ổn định.
 */
export function configsFor(
  set: RulesConfigSet,
  clientIds: readonly string[],
): RulesConfig[] {
  const picked =
    clientIds.length === 0
      ? [set.default]
      : clientIds.map((id) => set.byClient[id] ?? set.default);
  const byName = new Map(picked.map((config) => [config.name, config]));
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** `versions.rules`: các config đã dùng, `tên@version` nối bằng `+` (đã sắp). */
export function rulesVersion(configs: readonly RulesConfig[]): string {
  return configs.map((c) => `${c.name}@${String(c.version)}`).join("+");
}

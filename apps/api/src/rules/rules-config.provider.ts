import type { FactoryProvider } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  assertRulesReady,
  loadRulesConfigSet,
  type RulesConfigSet,
} from "@credflow/rules";
import type { Env } from "../config/env.schema.js";

export const RULES_CONFIG = Symbol("RULES_CONFIG");

/**
 * Config rule mặc định + theo khách hàng (plan 25). File nào sai schema, trùng tên, hoặc bộ rule
 * thiếu rule `block` thì factory ném lỗi, process không khởi động.
 */
export const rulesConfigProvider = {
  provide: RULES_CONFIG,
  inject: [ConfigService],
  useFactory: (config: ConfigService<Env, true>) => {
    const set = loadRulesConfigSet(
      config.get("RULES_CONFIG_PATH", { infer: true }),
    );
    for (const rules of [set.default, ...Object.values(set.byClient)]) {
      assertRulesReady(rules);
    }
    return set;
  },
} satisfies FactoryProvider<RulesConfigSet>;

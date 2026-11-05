import type { FactoryProvider } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { RulesConfig } from "@credflow/contracts";
import { assertRulesReady, loadRulesConfig } from "@credflow/rules";
import type { Env } from "../config/env.schema.js";

export const RULES_CONFIG = Symbol("RULES_CONFIG");

/** File sai schema hoặc bộ rule thiếu rule `block` thì factory ném lỗi, process không khởi động. */
export const rulesConfigProvider = {
  provide: RULES_CONFIG,
  inject: [ConfigService],
  useFactory: (config: ConfigService<Env, true>) => {
    const rules = loadRulesConfig(
      config.get("RULES_CONFIG_PATH", { infer: true }),
    );
    assertRulesReady(rules);
    return rules;
  },
} satisfies FactoryProvider<RulesConfig>;

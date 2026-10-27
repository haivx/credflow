import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { RulesConfig } from "@credflow/contracts";

/** Đọc và validate một file cấu hình rule. Sai schema thì ném lỗi, không chạy với config hỏng. */
export function loadRulesConfig(path: string): RulesConfig {
  return RulesConfig.parse(parse(readFileSync(path, "utf8")));
}

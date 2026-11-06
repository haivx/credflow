import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { parse } from "yaml";
import { RulesConfig } from "@credflow/contracts";
import type { RulesConfigSet } from "./config-set.js";

/** Đọc và validate một file cấu hình rule. Sai schema thì ném lỗi, không chạy với config hỏng. */
export function loadRulesConfig(path: string): RulesConfig {
  return RulesConfig.parse(parse(readFileSync(path, "utf8")));
}

/**
 * Đọc `<dir>/default.yaml` và mọi `<dir>/clients/<clientId>.yaml` (plan 25). Mỗi file validate riêng;
 * file khách hàng phải ghi `name` riêng (không bỏ trống, không trùng). Lỗi nêu đúng file.
 */
export function loadRulesConfigSet(dir: string): RulesConfigSet {
  const read = (path: string) => {
    try {
      return {
        raw: parse(readFileSync(path, "utf8")) as unknown,
        config: loadRulesConfig(path),
      };
    } catch (err) {
      throw new Error(
        `Config rule sai: ${path}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  };
  const defaultConfig = read(join(dir, "default.yaml")).config;
  const byClient: Record<string, RulesConfig> = {};
  const names = new Map<string, string>([[defaultConfig.name, "default.yaml"]]);

  const clientsDir = join(dir, "clients");
  const files = existsSync(clientsDir)
    ? readdirSync(clientsDir)
        .filter((f) => f.endsWith(".yaml"))
        .sort()
    : [];
  for (const file of files) {
    const path = join(clientsDir, file);
    const { raw, config } = read(path);
    const hasName = typeof raw === "object" && raw !== null && "name" in raw;
    if (!hasName || config.name === "default") {
      throw new Error(
        `Config rule sai: ${path}: file khách hàng phải có name riêng`,
      );
    }
    const clash = names.get(config.name);
    if (clash !== undefined) {
      throw new Error(
        `Config rule sai: ${path}: name "${config.name}" trùng với ${clash}`,
      );
    }
    names.set(config.name, file);
    byClient[basename(file, ".yaml")] = config;
  }
  return { default: defaultConfig, byClient };
}

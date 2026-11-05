// Test cho guardrail lint A3, A5, A9 (docs/agent/GUARDRAILS.md, plan 12a).
// Chạy ESLint thật với eslint.config.mjs trên đường dẫn file thật, nội dung là đoạn vi phạm cố ý.
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { ESLint } from "eslint";

const eslint = new ESLint({ cwd: new URL("../..", import.meta.url).pathname });

const ENGINE = "packages/rules/src/engine.ts";
const CONFIG = "packages/rules/src/config.ts";
const RULES_TEST = "packages/rules/src/rules.test.ts";
const CONTRACTS = "packages/contracts/src/common.ts";
const API = "apps/api/src/documents/documents.service.ts";

/** Message của các lỗi ESLint trên một đoạn code đặt ở `filePath`. */
async function lint(code, filePath) {
  const [result] = await eslint.lintText(code, { filePath });
  return result.messages.map((m) => `${m.ruleId}: ${m.message}`);
}

async function expectReported(code, filePath, pattern) {
  const messages = await lint(code, filePath);
  assert.ok(
    messages.some((m) => pattern.test(m)),
    `muốn thấy ${pattern}, nhận được:\n${messages.join("\n")}`,
  );
}

async function expectClean(code, filePath) {
  assert.deepEqual(await lint(code, filePath), []);
}

describe("A3: rule engine là hàm thuần", () => {
  it("cấm import I/O", async () => {
    await expectReported(
      `import { readFileSync } from "node:fs";\nexport const x = readFileSync;\n`,
      ENGINE,
      /^no-restricted-imports: .*A3:/,
    );
  });

  it("cấm import yaml", async () => {
    await expectReported(
      `import { parse } from "yaml";\nexport const x = parse;\n`,
      ENGINE,
      /^no-restricted-imports: .*A3:/,
    );
  });

  it("cấm import framework", async () => {
    await expectReported(
      `import { Injectable } from "@nestjs/common";\nexport const x = Injectable;\n`,
      ENGINE,
      /^no-restricted-imports: .*A3:/,
    );
  });

  it("cấm fetch và process", async () => {
    await expectReported(
      `export const x = fetch;\n`,
      ENGINE,
      /^no-restricted-globals: .*A3:/,
    );
    await expectReported(
      `export const x = process.env;\n`,
      ENGINE,
      /^no-restricted-globals: .*A3:/,
    );
  });

  it("cấm Math.random()", async () => {
    await expectReported(
      `export const x = Math.random();\n`,
      ENGINE,
      /^no-restricted-syntax: A3:/,
    );
  });

  it("cấm console.*", async () => {
    await expectReported(
      `console.log("x");\n`,
      ENGINE,
      /^no-restricted-syntax: A3:/,
    );
    await expectReported(
      `console.error("x");\n`,
      ENGINE,
      /^no-restricted-syntax: A3:/,
    );
  });

  it("engine vẫn nhận selector A5 (không bị block A3 ghi đè)", async () => {
    await expectReported(
      `export const x = Date.now();\n`,
      ENGINE,
      /^no-restricted-syntax: A5:/,
    );
  });

  it("cho phép import type từ contracts", async () => {
    await expectClean(
      `import type { RuleResult } from "@credflow/contracts";\nexport type X = RuleResult;\n`,
      ENGINE,
    );
  });

  it("config.ts được đọc file", async () => {
    await expectClean(
      `import { readFileSync } from "node:fs";\nexport const x = readFileSync;\n`,
      CONFIG,
    );
  });
});

describe("A5: packages/* không tạo Date", () => {
  for (const code of [
    `export const x = new Date();\n`,
    `export const x = new Date("2026-01-01");\n`,
    `export const x = Date();\n`,
    `export const x = Date.now();\n`,
  ]) {
    it(`báo: ${code.trim()}`, async () => {
      await expectReported(code, CONTRACTS, /^no-restricted-syntax: A5:/);
    });
  }

  it("file test được dùng Date", async () => {
    await expectClean(`export const x = Date.now();\n`, RULES_TEST);
  });

  it("apps/* được dùng Date", async () => {
    await expectClean(`export const x = new Date();\n`, API);
  });
});

describe("A9: eslint-disable phải có lý do, không thừa", () => {
  it("báo disable không có lý do", async () => {
    await expectReported(
      `// eslint-disable-next-line @typescript-eslint/no-explicit-any\nexport type X = any;\n`,
      CONTRACTS,
      /^@eslint-community\/eslint-comments\/require-description:/,
    );
  });

  it("báo disable thừa", async () => {
    await expectReported(
      `// eslint-disable-next-line no-debugger -- thử\nexport const x = 1;\n`,
      CONTRACTS,
      /Unused eslint-disable directive/,
    );
  });

  it("cho phép disable có lý do và đang dùng", async () => {
    await expectClean(
      `// eslint-disable-next-line @typescript-eslint/no-explicit-any -- ví dụ\nexport type X = any;\n`,
      CONTRACTS,
    );
  });
});

describe("A2: dữ liệu từ ngoài phải qua Zod", () => {
  const SERVICE = "apps/api/src/documents/documents.service.ts";
  const ENGINE_FILE = ENGINE;
  const API_SPEC = "apps/api/src/common/pg-error.spec.ts";
  const API_TEST = "apps/api/test/db.ts";
  const RULES_CONFIG = "packages/rules/src/config.ts";
  const HELPER = "packages/contracts/src/parse-json.ts";
  const ANY = `declare const v: any;\n`;
  const PARSE = `export const p = JSON.parse("{}") as { a: string };\n`;
  const REFERENCE = `export const p = JSON.parse;\n`;

  for (const [rule, code] of [
    ["no-unsafe-assignment", `${ANY}export const x: string = v;\n`],
    ["no-unsafe-member-access", `${ANY}export const x: unknown = v.a;\n`],
    ["no-unsafe-call", `${ANY}export const x: unknown = v();\n`],
    ["no-unsafe-return", `${ANY}export function f() { return v; }\n`],
    [
      "no-unsafe-argument",
      `${ANY}declare function g(s: string): void;\ng(v);\n`,
    ],
    [
      "no-unsafe-type-assertion",
      `declare const body: unknown;\nexport const x = body as { a: string };\n`,
    ],
  ]) {
    const pattern = new RegExp(`^@typescript-eslint/${rule}:`);

    it(`${rule} báo ở apps/api/src`, async () => {
      await expectReported(code, SERVICE, pattern);
    });

    it(`${rule} báo ở packages/*/src`, async () => {
      await expectReported(code, ENGINE_FILE, pattern);
    });
  }

  it("no-unsafe-type-assertion miễn file test", async () => {
    const messages = await lint(
      `declare const body: unknown;\nexport const x = body as { a: string };\n`,
      API_SPEC,
    );
    assert.deepEqual(messages, []);
  });

  it("5 rule no-unsafe vẫn áp cho file spec trong src", async () => {
    await expectReported(
      `${ANY}export const x: string = v;\n`,
      API_SPEC,
      /^@typescript-eslint\/no-unsafe-assignment:/,
    );
  });

  it("không bật no-unsafe cho apps/api/test", async () => {
    const messages = await lint(
      `${ANY}export const x: string = v;\n`,
      API_TEST,
    );
    assert.deepEqual(
      messages.filter((m) => m.includes("no-unsafe")),
      [],
    );
  });

  for (const [where, file] of [
    ["apps/api/src (block A14)", SERVICE],
    ["pg-error.ts (miễn trừ A14)", "apps/api/src/common/pg-error.ts"],
    ["schema.ts (miễn trừ A14)", "apps/api/src/db/schema.ts"],
    ["apps/api/scripts", "apps/api/scripts/seed.ts"],
    ["packages/rules/src/engine.ts (block A3)", ENGINE_FILE],
    ["packages/rules/src/config.ts (ngoài A3, A5)", RULES_CONFIG],
    ["packages/contracts/src (block A5)", CONTRACTS],
    ["eval/src", "eval/src/run.ts"],
    ["tools/synth/src", "tools/synth/src/generate.ts"],
  ]) {
    it(`cấm JSON.parse: ${where}`, async () => {
      await expectReported(PARSE, file, /^no-restricted-syntax: A2:/);
      await expectReported(REFERENCE, file, /^no-restricted-syntax: A2:/);
    });
  }

  it("cấm JSON.parse: apps/web (.tsx)", async () => {
    await expectReported(
      PARSE,
      "apps/web/app/page.tsx",
      /^no-restricted-syntax: A2:/,
    );
  });

  for (const [where, file] of [
    ["helper", HELPER],
    ["file spec", API_SPEC],
    ["file test", RULES_TEST],
    ["apps/api/test", API_TEST],
  ]) {
    it(`miễn JSON.parse: ${where}`, async () => {
      const messages = await lint(REFERENCE, file);
      assert.deepEqual(
        messages.filter((m) => m.includes("A2:")),
        [],
      );
    });
  }

  it("helper vẫn bị A5, không đọc đồng hồ", async () => {
    await expectReported(
      `export const x = Date.now();\n`,
      HELPER,
      /^no-restricted-syntax: A5:/,
    );
  });

  it("gộp selector không làm mất A3, A5, A14", async () => {
    await expectReported(
      `export const x = Math.random();\n`,
      ENGINE_FILE,
      /^no-restricted-syntax: A3:/,
    );
    await expectReported(
      `export const x = Date.now();\n`,
      ENGINE_FILE,
      /^no-restricted-syntax: A5:/,
    );
    await expectReported(
      `export const x = new Date();\n`,
      CONTRACTS,
      /^no-restricted-syntax: A5:/,
    );
    await expectReported(
      `export const f = (e: Error) => e.stack;\n`,
      SERVICE,
      /^no-restricted-syntax: A14:/,
    );
    await expectReported(
      `export const f = (e: Error) => e.stack;\n`,
      "apps/api/src/db/schema.ts",
      /^no-restricted-syntax: A14:/,
    );
  });
});

describe("A14: log lỗi DB an toàn (lớp phụ, gờ chính là formatErrorForLog + test)", () => {
  const SERVICE = "apps/api/src/documents/documents.service.ts";
  const HELPER = "apps/api/src/common/pg-error.ts";
  const SCHEMA = "apps/api/src/db/schema.ts";
  const SPEC = "apps/api/src/common/pg-error.spec.ts";
  const SCRIPT = "apps/api/scripts/seed.ts";

  const STACK = `export const f = (e: Error) => e.stack;\n`;
  const RAW = `import { sql } from "drizzle-orm";\nexport const x = sql.raw("1");\n`;
  const CONSOLE = `console.log("x");\n`;

  it("cấm .stack", async () => {
    await expectReported(STACK, SERVICE, /^no-restricted-syntax: A14:/);
  });

  it("helper được đọc .stack nhưng vẫn không được dùng sql.raw", async () => {
    await expectClean(STACK, HELPER);
    await expectReported(RAW, HELPER, /^no-restricted-syntax: A14:/);
  });

  it("cấm sql.raw", async () => {
    await expectReported(RAW, SERVICE, /^no-restricted-syntax: A14:/);
  });

  it("schema.ts được dùng sql.raw (DDL) nhưng vẫn không được đọc .stack", async () => {
    await expectClean(RAW, SCHEMA);
    await expectReported(STACK, SCHEMA, /^no-restricted-syntax: A14:/);
  });

  it("cấm console ở apps/api/src", async () => {
    await expectReported(CONSOLE, SERVICE, /^no-console:/);
  });

  it("scripts/ và file spec được dùng console", async () => {
    await expectClean(CONSOLE, SCRIPT);
    await expectClean(CONSOLE, SPEC);
  });
});

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import Anthropic from "@anthropic-ai/sdk";
import { EvalRun, GoldenCase, parseJson } from "@credflow/contracts";
import * as z from "zod";
import { assertRulesReady, loadRulesConfig } from "@credflow/rules";
import { envSchema } from "../src/config/env.schema.js";
import { type CacheEntry, EvalCache } from "../src/eval/cache.js";
import { checkGate, Gate } from "../src/eval/gate.js";
import {
  inputPathFor,
  readRecorded,
  writeRecorded,
} from "../src/eval/recorded.js";
import { mapWithLimit } from "../src/eval/limit.js";
import { computeMetrics, metricsByTag } from "../src/eval/metrics.js";
import { renderReport } from "../src/eval/report.js";
import {
  type CaseDeps,
  type LlmSession,
  runCase,
} from "../src/eval/run-case.js";
import { LLM_MODEL, LlmService } from "../src/llm/llm.service.js";
import { loadAllPrompts, PROMPT_VERSION } from "../src/llm/prompts.js";
import { PIPELINE_VERSIONS } from "../src/pipeline/pipeline.js";

// `make eval` (plan 18): chạy golden set qua đúng LlmService + rule engine của worker, không cần
// DB hay queue. Exit 0 khi chạy xong (kể cả có ca duyệt nhầm: đó là số liệu); exit 1 khi lỗi
// cấu hình, đáp án sai schema, hoặc có ca không chạy được.

const API_DIR = resolve(import.meta.dirname, "..");
const ROOT = resolve(API_DIR, "../..");
const RUNS_DIR = join(ROOT, "eval", "runs");
const CACHE_DIR = join(ROOT, "eval", "cache");
const REPORT_PATH = join(ROOT, "eval", "report.md");
const RECORDED_DIR = join(ROOT, "eval", "recorded");
const CONCURRENCY = 3;

const envFile = join(ROOT, ".env");
if (existsSync(envFile)) process.loadEnvFile(envFile);

const { values: args } = parseArgs({
  options: {
    split: { type: "string", default: "dev" },
    "no-cache": { type: "boolean", default: false },
    // Lặp lại được. Không truyền thì dùng hard-cases + synth (nếu đã `make synth`).
    cases: { type: "string", multiple: true },
    // Plan 20: ghi output LLM của ca dev vào eval/recorded/ để eval-ci dùng.
    record: { type: "boolean", default: false },
    // Plan 20: chấm lại rule trên eval/recorded/, không đọc ảnh, không gọi LLM, không cần khoá.
    recorded: { type: "boolean", default: false },
    // Chạy thử: không ghi eval/runs/ và eval/report.md.
    "no-save": { type: "boolean", default: false },
    // Đường dẫn gate.json: vượt mức thì exit 1.
    gate: { type: "string" },
  },
});

function fail(message: string): never {
  console.error(`make eval: ${message}`);
  process.exit(1);
}

const env = envSchema
  .pick({ ANTHROPIC_API_KEY: true, RULES_CONFIG_PATH: true })
  .parse(process.env);
if (!args.recorded && env.ANTHROPIC_API_KEY === undefined) {
  fail("thiếu ANTHROPIC_API_KEY (hoặc chạy --recorded)");
}
const split = args.split;
if (split !== "dev" && split !== "holdout")
  fail("--split phải là dev hoặc holdout");
// Holdout không ghi sẵn và không vào CI (plan 20): chỉ chạy tay khi chốt kết quả.
if ((args.record || args.recorded) && split !== "dev") {
  fail("--record và --recorded chỉ dùng với split dev");
}
if (args.record && args.recorded) fail("không dùng --record cùng --recorded");
const gate =
  args.gate === undefined
    ? undefined
    : parseJson(Gate, await readFile(resolve(ROOT, args.gate), "utf8"));

const DEFAULT_CASES = [
  "eval/hard-cases/cpr/cases.json",
  "data/synth/cpr/cases.json",
];
const caseFiles =
  args.cases ?? DEFAULT_CASES.filter((file) => existsSync(join(ROOT, file)));

const goldenCases: GoldenCase[] = [];
for (const file of caseFiles) {
  try {
    goldenCases.push(
      ...parseJson(
        GoldenCase.array(),
        await readFile(resolve(ROOT, file), "utf8"),
      ),
    );
  } catch (err) {
    if (!(err instanceof z.ZodError))
      fail(`${file}: không đọc được hoặc JSON không hợp lệ`);
    const lines = err.issues.map(
      (issue) => `  ${issue.path.join(".")}: ${issue.message}`,
    );
    fail(`${file} sai schema GoldenCase:\n${lines.join("\n")}`);
  }
}
const duplicate = goldenCases.find(
  (c, i) => goldenCases.findIndex((other) => other.id === c.id) !== i,
);
if (duplicate !== undefined)
  fail(`id ca bị trùng giữa các file: ${duplicate.id}`);
const cases = goldenCases.filter((c) => c.split === split);
if (cases.length === 0) fail(`không có ca nào thuộc split ${split}`);

const config = loadRulesConfig(resolve(API_DIR, env.RULES_CONFIG_PATH));
assertRulesReady(config);
const prompts = await loadAllPrompts();
// SDK tự thử lại 429/5xx 2 lần; worker để BullMQ lo việc này, eval không có BullMQ.
const client = new Anthropic({
  // Chế độ --recorded không gọi client này; khoá rỗng chỉ để khởi tạo được.
  apiKey: env.ANTHROPIC_API_KEY ?? "",
  maxRetries: 2,
  timeout: 60_000,
});

/** Mỗi ca một LlmService với client đếm token riêng, để chạy song song vẫn tính đúng ca. */
function newLlmSession(): LlmSession {
  const usage = { calls: 0, inputTokens: 0, outputTokens: 0 };
  const counting = {
    messages: {
      create: async (params: Anthropic.MessageCreateParamsNonStreaming) => {
        const response = await client.messages.create(params);
        usage.calls += 1;
        usage.inputTokens += response.usage.input_tokens;
        usage.outputTokens += response.usage.output_tokens;
        return response;
      },
    },
  };
  // LlmService chỉ dùng `messages.create`; bọc lại thay vì sửa LlmService để eval đo đúng code thật.
  const llm = new LlmService(counting as unknown as Anthropic, prompts);
  return { llm, usage: () => ({ ...usage }) };
}

/** sha256 của input để biết output ghi sẵn còn đúng không (synth: HTML; hard-cases: file). */
async function inputSha256(gc: GoldenCase): Promise<string> {
  const content = await readFile(resolve(ROOT, inputPathFor(gc)));
  return createHash("sha256").update(content).digest("hex");
}

const meta = async (gc: GoldenCase) => ({
  promptVersion: PROMPT_VERSION,
  model: LLM_MODEL,
  inputSha256: await inputSha256(gc),
});

const toRecord: { gc: GoldenCase; entry: CacheEntry }[] = [];
const deps: CaseDeps = {
  readFile: (path: string) => readFile(resolve(ROOT, path)),
  newLlmSession,
  cache: new EvalCache(CACHE_DIR),
  readCache: !args["no-cache"],
  config,
  promptVersion: PROMPT_VERSION,
  model: LLM_MODEL,
  ...(args.recorded
    ? {
        recorded: async (gc: GoldenCase) =>
          readRecorded(RECORDED_DIR, gc.id, await meta(gc)),
      }
    : {}),
  ...(args.record
    ? {
        onEntry: (gc: GoldenCase, entry: CacheEntry) => {
          toRecord.push({ gc, entry });
        },
      }
    : {}),
};

const startedAt = Date.now();
console.log(
  `make eval: ${String(cases.length)} ca từ ${caseFiles.join(", ")}, split ${split}, song song ${String(CONCURRENCY)}`,
);
const failures: string[] = [];
const results = await mapWithLimit(cases, CONCURRENCY, async (gc, i) => {
  try {
    const result = await runCase(gc, deps);
    const flag = result.falseApprove ? " ⚠️ duyệt nhầm" : "";
    console.log(
      `[${String(i + 1)}/${String(cases.length)}] ${gc.id} → ${result.decision}${result.cached ? (args.recorded ? " (ghi sẵn)" : " (cache)") : ""}${flag}`,
    );
    return result;
  } catch (err) {
    // Không chép message lỗi gốc vào file: có thể chứa dữ liệu. In ra terminal để sửa.
    const message = err instanceof Error ? err.message : String(err);
    failures.push(
      message.startsWith(`${gc.id}:`) ? message : `${gc.id}: ${message}`,
    );
    return undefined;
  }
});
if (failures.length > 0) {
  fail(
    `${String(failures.length)} ca không chạy được${args.recorded ? "" : " (ca đã xong nằm trong cache, chạy lại sẽ không gọi LLM cho chúng)"}:\n  ${failures.join("\n  ")}`,
  );
}
const caseResults = results.flatMap((r) => (r === undefined ? [] : [r]));

const previous = await latestRun(split);
const createdAt = new Date().toISOString();
const run = EvalRun.parse({
  id: createdAt.replace(/[:.]/g, "-"),
  createdAt,
  split,
  versions: { ...PIPELINE_VERSIONS, rules: String(config.version) },
  durationMs: Date.now() - startedAt,
  metrics: computeMetrics(caseResults),
  byTag: metricsByTag(caseResults),
  cases: caseResults,
  ...(previous === undefined ? {} : { previousRunId: previous.id }),
});

if (args.record) await saveRecorded();
if (!args["no-save"]) {
  await mkdir(RUNS_DIR, { recursive: true });
  await writeFile(
    join(RUNS_DIR, `${run.id}.json`),
    `${JSON.stringify(run, null, 2)}\n`,
  );
  await writeFile(REPORT_PATH, renderReport(run, previous));
}

const m = run.metrics;
console.log(
  `falseApproveRate ${(m.falseApproveRate * 100).toFixed(1)}% (${String(m.falseApproveCount)}/${String(m.n)}) · autoApproveRate ${(m.autoApproveRate * 100).toFixed(1)}% · LLM ${String(m.llmCalls)} lượt, cache ${String(m.cacheHits)} · ~$${m.costUsdTotal.toFixed(5)}`,
);
console.log(
  args["no-save"]
    ? "→ --no-save: không ghi eval/runs/, eval/report.md"
    : `→ eval/runs/${run.id}.json, eval/report.md`,
);

if (gate !== undefined) {
  const errors = checkGate(m, gate);
  if (errors.length > 0) {
    const falseApproves = caseResults
      .filter((c) => c.falseApprove)
      .map((c) => `${c.id} (${c.tags.join(", ")})`);
    fail(
      `cổng eval đỏ:\n  ${errors.join("\n  ")}\n  ca duyệt nhầm: ${falseApproves.join(", ")}`,
    );
  }
  console.log(
    `cổng eval: qua (${String(m.falseApproveCount)} ≤ ${String(gate.maxFalseApproveCount)})`,
  );
}

/** Ghi output của mọi ca dev vừa chạy; xoá file của ca không còn trong bộ. */
async function saveRecorded(): Promise<void> {
  const keep = new Set<string>();
  for (const { gc, entry } of toRecord) {
    await writeRecorded(RECORDED_DIR, gc.id, entry, await meta(gc));
    keep.add(`${gc.id}.json`);
  }
  for (const name of await readdir(RECORDED_DIR)) {
    if (name.endsWith(".json") && !keep.has(name)) {
      await rm(join(RECORDED_DIR, name));
    }
  }
  console.log(`→ eval/recorded/: ${String(keep.size)} ca`);
}

/** Lần chạy gần nhất cùng split; file hỏng hoặc sai schema thì bỏ qua. */
async function latestRun(wanted: string): Promise<EvalRun | undefined> {
  if (!existsSync(RUNS_DIR)) return undefined;
  const runs: EvalRun[] = [];
  for (const name of await readdir(RUNS_DIR)) {
    if (!name.endsWith(".json")) continue;
    try {
      const candidate = parseJson(
        EvalRun,
        await readFile(join(RUNS_DIR, name), "utf8"),
      );
      if (candidate.split === wanted) runs.push(candidate);
    } catch {
      // file hỏng hoặc sai schema: bỏ qua
    }
  }
  return runs.sort((a, b) => a.createdAt.localeCompare(b.createdAt)).at(-1);
}

import { createHash } from "node:crypto";
import { extname } from "node:path";
import type {
  Classification,
  EvalCaseResult,
  Extraction,
  GoldenCase,
} from "@credflow/contracts";
import {
  configsFor,
  evaluateRulesForConfigs,
  type RulesConfigSet,
  route,
} from "@credflow/rules";
import { LlmError, type LlmDocument } from "../llm/llm.service.js";
import { type CacheEntry, cacheKey, type EvalCache } from "./cache.js";
import { compareFields, isFalseApprove } from "./compare.js";

/** Phần của `LlmService` mà eval dùng. */
export interface CaseLlm {
  classify(doc: LlmDocument): Promise<Classification>;
  extractCpr(doc: LlmDocument): Promise<Extraction>;
}

/** Một `LlmService` riêng cho mỗi ca, để đếm token đúng ca khi chạy song song. */
export interface LlmSession {
  llm: CaseLlm;
  usage(): CacheEntry["usage"];
}

export interface CaseDeps {
  readFile(path: string): Promise<Buffer>;
  newLlmSession(): LlmSession;
  cache: EvalCache;
  /** `false` khi chạy `--no-cache`: vẫn ghi kết quả mới vào cache. */
  readCache: boolean;
  /** Config theo khách hàng (plan 25): ca chấm theo `configsFor(configs, gc.staff.clientIds)`. */
  configs: RulesConfigSet;
  promptVersion: string;
  model: string;
  /** Chế độ `--recorded`: lấy output đã ghi, không đọc file, không gọi LLM (plan 20). */
  recorded?: (gc: GoldenCase) => Promise<CacheEntry>;
  /** Nhận entry của mỗi ca sau khi có, để `--record` ghi lại. */
  onEntry?: (gc: GoldenCase, entry: CacheEntry) => void;
}

const MIME_BY_EXT: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

/**
 * Chạy một ca như worker: phân loại → trích xuất (chỉ CPR) → rule → routing, rồi so với đáp án.
 * LLM lỗi không retry được thì ca ra `needs_review` như pipeline thật. Lỗi tạm thì ném ra, không
 * ghi cache: ca đó không chạy được, lần sau chạy lại.
 */
export async function runCase(
  gc: GoldenCase,
  deps: CaseDeps,
): Promise<EvalCaseResult> {
  const mimeType = MIME_BY_EXT[extname(gc.file).toLowerCase()];
  if (mimeType === undefined) {
    throw new Error(`Ca ${gc.id}: đuôi file không hỗ trợ (${gc.file})`);
  }
  const { entry, cached } =
    deps.recorded === undefined
      ? await loadOrCall(gc, mimeType, deps)
      : { entry: await deps.recorded(gc), cached: true };
  deps.onEntry?.(gc, entry);

  const { classification, extraction } = entry;
  const ruleResults =
    classification === undefined || extraction === undefined
      ? []
      : evaluateRulesForConfigs(
          {
            extraction,
            classification,
            declaredDocType: gc.declaredDocType,
            staff: gc.staff,
            asOf: gc.asOf,
          },
          configsFor(deps.configs, gc.staff.clientIds),
        );
  const routing = route(ruleResults);
  const { compared, mismatches } = compareFields(
    gc.expected.fields,
    extraction,
  );

  return {
    id: gc.id,
    tags: gc.tags,
    expectedDecision: gc.expected.decision,
    decision: routing.decision,
    reasons: routing.reasons,
    expectedDocType: gc.expected.docType,
    docType: classification?.docType ?? null,
    falseApprove: isFalseApprove(
      routing.decision,
      gc.expected.decision,
      mismatches,
    ),
    fieldMismatches: mismatches,
    fieldsCompared: compared,
    error: entry.error,
    cached,
    llmCalls: cached ? 0 : entry.usage.calls,
    latencyMs: entry.latencyMs,
    inputTokens: entry.usage.inputTokens,
    outputTokens: entry.usage.outputTokens,
  };
}

/** Cache theo sha256 file; miss thì gọi LLM rồi ghi cache. */
async function loadOrCall(
  gc: GoldenCase,
  mimeType: string,
  deps: CaseDeps,
): Promise<{ entry: CacheEntry; cached: boolean }> {
  const content = await deps.readFile(gc.file);
  const sha256 = createHash("sha256").update(content).digest("hex");
  const key = cacheKey(sha256, deps.promptVersion, deps.model);
  const hit = deps.readCache ? await deps.cache.get(key) : undefined;
  if (hit !== undefined) return { entry: hit, cached: true };
  const entry = await callLlm({ documentId: gc.id, mimeType, content }, deps);
  await deps.cache.set(key, entry);
  return { entry, cached: false };
}

async function callLlm(doc: LlmDocument, deps: CaseDeps): Promise<CacheEntry> {
  const session = deps.newLlmSession();
  const startedAt = performance.now();
  let classification: Classification | undefined;
  let extraction: Extraction | undefined;
  let error: string | null = null;

  try {
    classification = await session.llm.classify(doc);
    if (classification.docType === "cpr_card") {
      extraction = await session.llm.extractCpr(doc);
    }
  } catch (err) {
    if (!(err instanceof LlmError) || err.retryable) throw err;
    error = err.message;
  }

  return {
    ...(classification === undefined ? {} : { classification }),
    ...(extraction === undefined ? {} : { extraction }),
    error,
    usage: session.usage(),
    latencyMs: Math.round(performance.now() - startedAt),
  };
}

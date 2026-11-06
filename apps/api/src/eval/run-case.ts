import { createHash } from "node:crypto";
import { extname } from "node:path";
import type {
  Classification,
  EvalCaseResult,
  Extraction,
  GoldenCase,
  RulesConfig,
} from "@credflow/contracts";
import { evaluateRules, route } from "@credflow/rules";
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
  config: RulesConfig;
  promptVersion: string;
  model: string;
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
  const content = await deps.readFile(gc.file);
  const sha256 = createHash("sha256").update(content).digest("hex");
  const key = cacheKey(sha256, deps.promptVersion, deps.model);

  const hit = deps.readCache ? await deps.cache.get(key) : undefined;
  const entry =
    hit ?? (await callLlm({ documentId: gc.id, mimeType, content }, deps));
  if (hit === undefined) await deps.cache.set(key, entry);

  const { classification, extraction } = entry;
  const ruleResults =
    classification === undefined || extraction === undefined
      ? []
      : evaluateRules({
          extraction,
          classification,
          declaredDocType: gc.declaredDocType,
          staff: gc.staff,
          config: deps.config,
          asOf: gc.asOf,
        });
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
    cached: hit !== undefined,
    llmCalls: hit === undefined ? entry.usage.calls : 0,
    latencyMs: entry.latencyMs,
    inputTokens: entry.usage.inputTokens,
    outputTokens: entry.usage.outputTokens,
  };
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

import type { EvalCaseResult, EvalMetrics } from "@credflow/contracts";
import { PRICE_USD_PER_MTOK } from "./pricing.js";

/** Nearest-rank: giá trị nhỏ nhất mà ít nhất p% số mẫu ≤ nó. Rỗng ra 0. */
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index] ?? 0;
}

export function costUsd(inputTokens: number, outputTokens: number): number {
  return (
    (inputTokens * PRICE_USD_PER_MTOK.input +
      outputTokens * PRICE_USD_PER_MTOK.output) /
    1_000_000
  );
}

const ratio = (part: number, whole: number) => (whole === 0 ? 0 : part / whole);
const sum = (values: readonly number[]) => values.reduce((a, b) => a + b, 0);

export function computeMetrics(cases: readonly EvalCaseResult[]): EvalMetrics {
  const n = cases.length;
  const falseApproveCount = cases.filter((c) => c.falseApprove).length;
  const inputTokens = sum(cases.map((c) => c.inputTokens));
  const outputTokens = sum(cases.map((c) => c.outputTokens));
  const costUsdTotal = costUsd(inputTokens, outputTokens);
  const latencies = cases.map((c) => c.latencyMs);

  return {
    n,
    classificationAccuracy: ratio(
      cases.filter((c) => c.docType === c.expectedDocType).length,
      n,
    ),
    fieldAccuracy: fieldAccuracy(cases),
    falseApproveCount,
    falseApproveRate: ratio(falseApproveCount, n),
    autoApproveRate: ratio(
      cases.filter((c) => c.decision === "auto_approve").length,
      n,
    ),
    llmCalls: sum(cases.map((c) => c.llmCalls)),
    cacheHits: cases.filter((c) => c.cached).length,
    inputTokens,
    outputTokens,
    costUsdTotal,
    costUsdPerDoc: ratio(costUsdTotal, n),
    latencyMsP50: percentile(latencies, 50),
    latencyMsP95: percentile(latencies, 95),
  };
}

/** Một ca có nhiều tag thì được tính trong mọi nhóm của nó. */
export function metricsByTag(
  cases: readonly EvalCaseResult[],
): Record<string, EvalMetrics> {
  const groups = new Map<string, EvalCaseResult[]>();
  for (const c of cases) {
    for (const tag of c.tags) groups.set(tag, [...(groups.get(tag) ?? []), c]);
  }
  return Object.fromEntries(
    [...groups].map(([tag, group]) => [tag, computeMetrics(group)]),
  );
}

function fieldAccuracy(
  cases: readonly EvalCaseResult[],
): Record<string, number> {
  const compared = new Map<string, number>();
  const matched = new Map<string, number>();
  for (const c of cases) {
    for (const name of c.fieldsCompared) {
      compared.set(name, (compared.get(name) ?? 0) + 1);
      if (!c.fieldMismatches.includes(name)) {
        matched.set(name, (matched.get(name) ?? 0) + 1);
      }
    }
  }
  return Object.fromEntries(
    [...compared].map(([name, total]) => [
      name,
      ratio(matched.get(name) ?? 0, total),
    ]),
  );
}

import type { EvalCaseResult } from "@credflow/contracts";
import { describe, expect, it } from "vitest";
import {
  computeMetrics,
  costUsd,
  metricsByTag,
  percentile,
} from "./metrics.js";

const result = (overrides: Partial<EvalCaseResult> = {}): EvalCaseResult => ({
  id: "c",
  tags: ["clean"],
  expectedDecision: "auto_approve",
  decision: "auto_approve",
  reasons: [],
  expectedDocType: "cpr_card",
  docType: "cpr_card",
  falseApprove: false,
  fieldMismatches: [],
  fieldsCompared: ["holderName", "expirationDate"],
  error: null,
  cached: false,
  llmCalls: 2,
  latencyMs: 1000,
  inputTokens: 1_000_000,
  outputTokens: 1_000_000,
  ...overrides,
});

describe("percentile (nearest-rank)", () => {
  it("rỗng ra 0; một giá trị ra chính nó", () => {
    expect(percentile([], 50)).toBe(0);
    expect(percentile([7], 95)).toBe(7);
  });

  it("2 và 6 giá trị, không cần sắp trước", () => {
    expect(percentile([20, 10], 50)).toBe(10);
    expect(percentile([20, 10], 95)).toBe(20);
    expect(percentile([6, 1, 5, 2, 4, 3], 50)).toBe(3);
    expect(percentile([6, 1, 5, 2, 4, 3], 95)).toBe(6);
  });
});

describe("costUsd", () => {
  it("Haiku 5.5: $0.10 / 1M input, $0.50 / 1M output", () => {
    expect(costUsd(1_000_000, 1_000_000)).toBeCloseTo(0.6, 10);
    expect(costUsd(0, 0)).toBe(0);
  });
});

describe("computeMetrics", () => {
  it("0 ca: mọi số là 0, không chia cho 0", () => {
    const m = computeMetrics([]);
    expect(m.n).toBe(0);
    expect(m.falseApproveRate).toBe(0);
    expect(m.costUsdPerDoc).toBe(0);
    expect(m.fieldAccuracy).toEqual({});
  });

  it("đếm đúng trên 4 ca", () => {
    const m = computeMetrics([
      result({ id: "a" }),
      result({
        id: "b",
        falseApprove: true,
        fieldMismatches: ["expirationDate"],
        cached: true,
        llmCalls: 0,
        latencyMs: 3000,
      }),
      result({
        id: "c",
        decision: "needs_review",
        expectedDecision: "needs_review",
        latencyMs: 2000,
      }),
      result({
        id: "d",
        decision: "needs_review",
        expectedDocType: "tb_test",
        docType: "cpr_card",
        fieldsCompared: [],
        latencyMs: 4000,
      }),
    ]);
    expect(m).toMatchObject({
      n: 4,
      classificationAccuracy: 0.75,
      fieldAccuracy: { holderName: 1, expirationDate: 2 / 3 },
      falseApproveCount: 1,
      falseApproveRate: 0.25,
      autoApproveRate: 0.5,
      llmCalls: 6,
      cacheHits: 1,
      inputTokens: 4_000_000,
      outputTokens: 4_000_000,
      latencyMsP50: 2000,
      latencyMsP95: 4000,
    });
    expect(m.costUsdTotal).toBeCloseTo(2.4, 10);
    expect(m.costUsdPerDoc).toBeCloseTo(0.6, 10);
  });

  it("docType null (LLM lỗi trước khi phân loại) tính là phân loại sai", () => {
    expect(
      computeMetrics([result({ docType: null })]).classificationAccuracy,
    ).toBe(0);
  });
});

describe("metricsByTag", () => {
  it("một ca nhiều tag nằm ở mọi nhóm của nó", () => {
    const byTag = metricsByTag([
      result({ id: "a", tags: ["clean"] }),
      result({
        id: "b",
        tags: ["name_variant", "no_printed_expiry"],
        falseApprove: true,
      }),
    ]);
    expect(Object.keys(byTag).sort()).toEqual([
      "clean",
      "name_variant",
      "no_printed_expiry",
    ]);
    expect(byTag.clean?.n).toBe(1);
    expect(byTag.name_variant?.falseApproveCount).toBe(1);
  });
});

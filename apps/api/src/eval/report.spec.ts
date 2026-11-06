import type { EvalCaseResult, EvalRun } from "@credflow/contracts";
import { describe, expect, it } from "vitest";
import { computeMetrics, metricsByTag } from "./metrics.js";
import { renderReport } from "./report.js";

const result = (overrides: Partial<EvalCaseResult>): EvalCaseResult => ({
  id: "c",
  tags: ["clean"],
  expectedDecision: "auto_approve",
  decision: "auto_approve",
  reasons: [],
  expectedDocType: "cpr_card",
  docType: "cpr_card",
  falseApprove: false,
  fieldMismatches: [],
  fieldsCompared: ["expirationDate"],
  error: null,
  cached: false,
  llmCalls: 2,
  latencyMs: 1000,
  inputTokens: 3000,
  outputTokens: 500,
  ...overrides,
});

const run = (id: string, cases: EvalCaseResult[]): EvalRun => ({
  id,
  createdAt: "2026-11-06T04:00:00Z",
  split: "dev",
  versions: {
    pipeline: "16",
    prompt: "classify@1+extract-cpr@1",
    model: "claude-haiku-5-5",
    rules: "1",
  },
  durationMs: 4000,
  metrics: computeMetrics(cases),
  byTag: metricsByTag(cases),
  cases,
});

describe("renderReport", () => {
  it("lần đầu: không có cột so sánh, liệt kê ca duyệt nhầm kèm lý do", () => {
    const md = renderReport(
      run("r1", [
        result({ id: "01-expires" }),
        result({
          id: "03-renewal-month",
          tags: ["name_variant"],
          expectedDecision: "needs_review",
          falseApprove: true,
        }),
        result({
          id: "07-x",
          falseApprove: true,
          fieldMismatches: ["expirationDate"],
        }),
      ]),
    );
    expect(md).toContain("chưa có lần chạy trước");
    expect(md).toContain("| falseApproveRate (mục tiêu 0) | 66.7% | — | — |");
    expect(md).toContain(
      "`03-renewal-month` (name_variant): tự duyệt, đáp án là needs_review",
    );
    expect(md).toContain("`07-x` (clean): tự duyệt, đọc sai: expirationDate");
    expect(md).not.toContain("\n\n\n");
  });

  it("có lần trước: ghi Δ, và không có ca duyệt nhầm thì nói rõ", () => {
    const before = run("r1", [
      result({ id: "a", falseApprove: true, expectedDecision: "needs_review" }),
    ]);
    const now = run("r2", [result({ id: "a", decision: "needs_review" })]);
    const md = renderReport({ ...now, previousRunId: "r1" }, before);
    expect(md).toContain("`r1`");
    expect(md).toContain(
      "| falseApproveRate (mục tiêu 0) | 0.0% | 100.0% | -100.0% |",
    );
    expect(md).toContain("Không có ca nào.");
  });

  it("cột nguồn theo tiền tố id, và bảng metric theo nguồn", () => {
    const md = renderReport(
      run("r1", [
        result({ id: "01-expires" }),
        result({ id: "synth-cpr-0001", decision: "needs_review" }),
        result({ id: "synth-cpr-0002" }),
      ]),
    );
    expect(md).toContain("| `01-expires` | hard-cases |");
    expect(md).toContain("| `synth-cpr-0001` | synth |");
    expect(md).toContain("## Theo nguồn");
    expect(md).toContain("| hard-cases | 1 | 0.0% | 100.0% |");
    expect(md).toContain("| synth | 2 | 0.0% | 50.0% |");
  });
});

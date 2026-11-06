import type { EvalCaseResult, EvalMetrics, EvalRun } from "@credflow/contracts";
import { computeMetrics } from "./metrics.js";

type Row = [
  label: string,
  key: keyof EvalMetrics,
  format: (n: number) => string,
];

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const int = (n: number) => String(n);
const usd = (n: number) => `$${n.toFixed(5)}`;
const ms = (n: number) => `${String(Math.round(n))} ms`;

/** Thứ tự = thứ tự quan trọng: duyệt nhầm đứng đầu. */
const ROWS: Row[] = [
  ["falseApproveRate (mục tiêu 0)", "falseApproveRate", pct],
  ["falseApproveCount", "falseApproveCount", int],
  ["autoApproveRate", "autoApproveRate", pct],
  ["classificationAccuracy", "classificationAccuracy", pct],
  ["latency p50", "latencyMsP50", ms],
  ["latency p95", "latencyMsP95", ms],
  ["chi phí / giấy (ước tính)", "costUsdPerDoc", usd],
  ["chi phí tổng (ước tính)", "costUsdTotal", usd],
  ["lượt gọi LLM lần này", "llmCalls", int],
  ["ca lấy từ cache", "cacheHits", int],
];

/** Ca synth có id `synth-…` (plan 19); còn lại là ca làm tay trong `eval/hard-cases/`. */
export function caseSource(id: string): "synth" | "hard-cases" {
  return id.startsWith("synth-") ? "synth" : "hard-cases";
}

/** Report markdown của một lần chạy, so với lần trước nếu có. Chỉ tên trường, không giá trị. */
export function renderReport(run: EvalRun, previous?: EvalRun): string {
  const m = run.metrics;
  const p = previous?.metrics;
  const lines: string[] = [
    "# Eval report",
    "",
    "> Sinh tự động bởi `make eval` (plan 18). Đừng sửa tay.",
    "",
    `- **Run:** \`${run.id}\` · split \`${run.split}\` · ${String(m.n)} ca`,
    `- **Versions:** pipeline \`${run.versions.pipeline}\`, prompt \`${run.versions.prompt}\`, model \`${run.versions.model}\`, rules \`${run.versions.rules}\``,
    `- **Thời gian chạy:** ${ms(run.durationMs)} · **Chi phí ước tính:** ${usd(m.costUsdTotal)} (giá ghi trong \`apps/api/src/eval/pricing.ts\`; tính cả ca lấy từ cache)`,
    `- **So với:** ${previous === undefined ? "chưa có lần chạy trước" : `\`${previous.id}\` (versions rules \`${previous.versions.rules}\`, prompt \`${previous.versions.prompt}\`)`}`,
    "",
    "## Metric",
    "",
    "| Metric | Lần này | Lần trước | Δ |",
    "| --- | --- | --- | --- |",
    ...ROWS.map(([label, key, format]) => {
      const now = m[key];
      const before = p?.[key];
      if (typeof now !== "number") return "";
      if (typeof before !== "number")
        return `| ${label} | ${format(now)} | — | — |`;
      const delta = now - before;
      const sign = delta > 0 ? "+" : "";
      return `| ${label} | ${format(now)} | ${format(before)} | ${delta === 0 ? "0" : `${sign}${format(delta)}`} |`;
    }),
    "",
    "## Duyệt nhầm",
    "",
  ];

  const falseApproves = run.cases.filter((c) => c.falseApprove);
  if (falseApproves.length === 0) {
    lines.push("Không có ca nào.");
  } else {
    for (const c of falseApproves) {
      const why =
        c.expectedDecision === "needs_review"
          ? "đáp án là needs_review"
          : `đọc sai: ${c.fieldMismatches.join(", ")}`;
      lines.push(`- \`${c.id}\` (${c.tags.join(", ")}): tự duyệt, ${why}`);
    }
  }

  lines.push(
    "",
    "## Theo nguồn",
    "",
    "| Nguồn | n | falseApproveRate | autoApproveRate | classificationAccuracy |",
    "| --- | --- | --- | --- | --- |",
    ...bySource(run.cases).map(
      ([source, m]) =>
        `| ${source} | ${String(m.n)} | ${pct(m.falseApproveRate)} | ${pct(m.autoApproveRate)} | ${pct(m.classificationAccuracy)} |`,
    ),
    "",
    "## Từng ca",
    "",
    "| Ca | Nguồn | Kỳ vọng | Thực tế | Lý do | Trường sai | Cache | Lỗi |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ...run.cases.map((c) => {
      const flag = c.falseApprove ? " ⚠️" : "";
      return `| \`${c.id}\` | ${caseSource(c.id)} | ${c.expectedDecision} | ${c.decision}${flag} | ${c.reasons.join(", ") || "—"} | ${c.fieldMismatches.join(", ") || "—"} | ${c.cached ? "có" : "không"} | ${c.error ?? "—"} |`;
    }),
    "",
    "## Độ chính xác từng trường",
    "",
    "| Trường | Lần này | Lần trước |",
    "| --- | --- | --- |",
    ...Object.entries(m.fieldAccuracy)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, value]) => {
        const before = p?.fieldAccuracy[name];
        return `| ${name} | ${pct(value)} | ${before === undefined ? "—" : pct(before)} |`;
      }),
    "",
    "## Theo tag",
    "",
    "| Tag | n | falseApproveRate | autoApproveRate |",
    "| --- | --- | --- | --- |",
    ...Object.entries(run.byTag)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(
        ([tag, t]) =>
          `| ${tag} | ${String(t.n)} | ${pct(t.falseApproveRate)} | ${pct(t.autoApproveRate)} |`,
      ),
    "",
  );
  return lines
    .filter((line, i, all) => !(line === "" && all[i - 1] === ""))
    .join("\n");
}

function bySource(cases: readonly EvalCaseResult[]): [string, EvalMetrics][] {
  const sources = ["hard-cases", "synth"] as const;
  return sources
    .map((source): [string, EvalCaseResult[]] => [
      source,
      cases.filter((c) => caseSource(c.id) === source),
    ])
    .filter(([, group]) => group.length > 0)
    .map(([source, group]) => [source, computeMetrics(group)]);
}

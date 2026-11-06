import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Extraction, type GoldenCase, parseJson } from "@credflow/contracts";
import { loadRulesConfigSet } from "@credflow/rules";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LlmError } from "../llm/llm.service.js";
import { EvalCache } from "./cache.js";
import { type CaseDeps, type CaseLlm, runCase } from "./run-case.js";

const ROOT = join(import.meta.dirname, "..", "..", "..", "..");
const configs = loadRulesConfigSet(join(ROOT, "config", "rules"));
const recorded01 = parseJson(
  Extraction,
  readFileSync(
    join(ROOT, "eval", "hard-cases", "cpr", "recorded", "01-expires.json"),
    "utf8",
  ),
);

const golden = (overrides: Partial<GoldenCase> = {}): GoldenCase => ({
  id: "01-expires",
  file: "eval/hard-cases/cpr/01-expires.png",
  staff: {
    id: "s1",
    legalName: "Marisol Quennell",
    aliases: [],
    role: "caregiver",
    clientIds: [],
    region: "CA",
  },
  asOf: "2026-11-06",
  expected: {
    docType: "cpr_card",
    fields: { holderName: "Marisol Quennell", expirationDate: "2028-03-14" },
    decision: "auto_approve",
  },
  tags: ["clean"],
  split: "dev",
  ...overrides,
});

describe("runCase", () => {
  let dir: string;
  let classify: ReturnType<typeof vi.fn<CaseLlm["classify"]>>;
  let extractCpr: ReturnType<typeof vi.fn<CaseLlm["extractCpr"]>>;
  let deps: CaseDeps;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "eval-run-"));
    classify = vi
      .fn<CaseLlm["classify"]>()
      .mockResolvedValue({ docType: "cpr_card", confidence: 0.97 });
    extractCpr = vi.fn<CaseLlm["extractCpr"]>().mockResolvedValue(recorded01);
    deps = {
      readFile: () => Promise.resolve(Buffer.from("SAMPLE png bytes")),
      newLlmSession: () => ({
        llm: { classify, extractCpr },
        usage: () => ({ calls: 2, inputTokens: 3000, outputTokens: 500 }),
      }),
      cache: new EvalCache(dir),
      readCache: true,
      configs,
      promptVersion: "classify@1+extract-cpr@1",
      model: "claude-haiku-5-5",
    };
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("ca tốt: gọi LLM, tự duyệt, không duyệt nhầm; lần hai lấy từ cache", async () => {
    const first = await runCase(golden(), deps);
    expect(first).toMatchObject({
      decision: "auto_approve",
      reasons: [],
      docType: "cpr_card",
      falseApprove: false,
      fieldMismatches: [],
      cached: false,
      llmCalls: 2,
      inputTokens: 3000,
      outputTokens: 500,
    });

    const second = await runCase(golden(), deps);
    expect(classify).toHaveBeenCalledTimes(1);
    expect(second).toMatchObject({
      decision: "auto_approve",
      cached: true,
      llmCalls: 0,
      inputTokens: 3000,
    });
  });

  it("readCache = false: gọi lại LLM dù đã có cache", async () => {
    await runCase(golden(), deps);
    await runCase(golden(), { ...deps, readCache: false });
    expect(classify).toHaveBeenCalledTimes(2);
  });

  it("tự duyệt mà đáp án là needs_review → duyệt nhầm", async () => {
    const result = await runCase(
      golden({
        expected: { ...golden().expected, decision: "needs_review" },
      }),
      deps,
    );
    expect(result.falseApprove).toBe(true);
  });

  it("tự duyệt nhưng một trường lệch đáp án → duyệt nhầm, ghi tên trường", async () => {
    const result = await runCase(
      golden({
        expected: {
          ...golden().expected,
          fields: { expirationDate: "2028-03-15" },
        },
      }),
      deps,
    );
    expect(result.decision).toBe("auto_approve");
    expect(result.fieldMismatches).toEqual(["expirationDate"]);
    expect(result.falseApprove).toBe(true);
  });

  it("staff khác tên → NAME_MISMATCH, không tự duyệt", async () => {
    const result = await runCase(
      golden({ staff: { ...golden().staff, legalName: "Odalys Venn" } }),
      deps,
    );
    expect(result.decision).toBe("needs_review");
    expect(result.reasons).toEqual(["NAME_MISMATCH"]);
  });

  it("không phải CPR: không trích xuất, NO_RULES_EVALUATED", async () => {
    classify.mockResolvedValue({ docType: "tb_test", confidence: 0.97 });
    const result = await runCase(
      golden({
        expected: { docType: "tb_test", fields: {}, decision: "needs_review" },
      }),
      deps,
    );
    expect(extractCpr).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      decision: "needs_review",
      reasons: ["NO_RULES_EVALUATED"],
      docType: "tb_test",
      falseApprove: false,
    });
  });

  it("LLM lỗi không retry được: needs_review, ghi lỗi, có cache", async () => {
    extractCpr.mockRejectedValue(
      new LlmError("extract", "model từ chối", false),
    );
    const result = await runCase(golden(), deps);
    expect(result).toMatchObject({
      decision: "needs_review",
      error: "LLM lỗi ở bước extract: model từ chối",
      docType: "cpr_card",
    });
    await runCase(golden(), deps);
    expect(extractCpr).toHaveBeenCalledTimes(1);
  });

  it("LLM lỗi tạm (retry được): ném lỗi, không ghi cache", async () => {
    classify.mockRejectedValueOnce(
      new LlmError("classify", "API trả 529", true),
    );
    await expect(runCase(golden(), deps)).rejects.toThrow("API trả 529");
    const again = await runCase(golden(), deps);
    expect(again.cached).toBe(false);
  });

  it("file lạ đuôi: lỗi cấu hình", async () => {
    await expect(
      runCase(golden({ file: "eval/x/a.gif" }), deps),
    ).rejects.toThrow("đuôi file");
  });

  it("chế độ recorded: không đọc file, không gọi LLM, dùng entry đã ghi", async () => {
    const readFile = vi.fn<CaseDeps["readFile"]>();
    const result = await runCase(golden(), {
      ...deps,
      readFile,
      recorded: () =>
        Promise.resolve({
          classification: { docType: "cpr_card", confidence: 0.97 },
          extraction: recorded01,
          error: null,
          usage: { calls: 2, inputTokens: 3000, outputTokens: 500 },
          latencyMs: 1200,
        }),
    });
    expect(readFile).not.toHaveBeenCalled();
    expect(classify).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      decision: "auto_approve",
      cached: true,
      llmCalls: 0,
      inputTokens: 3000,
      latencyMs: 1200,
    });
  });

  it("onEntry nhận đúng entry của ca (để --record ghi lại)", async () => {
    const seen: string[] = [];
    await runCase(golden(), {
      ...deps,
      onEntry: (gc, entry) => {
        seen.push(`${gc.id}:${entry.classification?.docType ?? "-"}`);
      },
    });
    expect(seen).toEqual(["01-expires:cpr_card"]);
  });
});

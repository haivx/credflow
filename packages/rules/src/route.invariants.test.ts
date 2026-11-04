import { describe, expect, it } from "vitest";
import { RuleCode, type RuleResult } from "@credflow/contracts";
import { route } from "./index.js";

// A4 (docs/agent/GUARDRAILS.md): chỉ auto_approve khi mọi rule block đều qua.
// Sinh MỌI danh sách dài 0..MAX_LEN (4 trạng thái mỗi rule, tính cả thứ tự) thay cho property-based.

const MAX_LEN = 4;
const STATES = [
  { severity: "block", passed: true },
  { severity: "block", passed: false },
  { severity: "info", passed: true },
  { severity: "info", passed: false },
] as const;

/** Code khác nhau cho từng vị trí, để thấy rõ code nào lọt vào `reasons`. */
function codeAt(i: number): RuleCode {
  const code = RuleCode.options[i];
  if (code === undefined) throw new Error(`RuleCode không đủ ${i + 1} mã`);
  return code;
}

function rule(
  code: RuleCode,
  severity: RuleResult["severity"],
  passed: boolean,
): RuleResult {
  return { code, severity, passed, message: "", fieldRefs: [] };
}

/** Mọi danh sách dài 0..maxLen: 1 + 4 + 16 + 64 + 256 = 341 với maxLen = 4. */
function* allLists(maxLen: number): Generator<RuleResult[]> {
  function* build(prefix: RuleResult[]): Generator<RuleResult[]> {
    yield prefix;
    if (prefix.length === maxLen) return;
    for (const s of STATES) {
      yield* build([
        ...prefix,
        rule(codeAt(prefix.length), s.severity, s.passed),
      ]);
    }
  }
  yield* build([]);
}

/** Dạng gọn để in khi test hỏng, vd `B✓ B✗ I✗`. */
const show = (list: RuleResult[]) =>
  list.length === 0
    ? "(rỗng)"
    : list
        .map(
          (r) => `${r.severity === "block" ? "B" : "I"}${r.passed ? "✓" : "✗"}`,
        )
        .join(" ");

const isBlock = (r: RuleResult) => r.severity === "block";
const LISTS = [...allLists(MAX_LEN)];

describe("route() bất biến (A4)", () => {
  it("sinh đủ 341 danh sách", () => {
    expect(LISTS).toHaveLength(341);
  });

  it("1. auto_approve ⇔ mọi rule block đều passed", () => {
    for (const list of LISTS.filter((l) => l.length > 0)) {
      const allBlockPassed = list.filter(isBlock).every((r) => r.passed);
      expect(route(list).decision === "auto_approve", show(list)).toBe(
        allBlockPassed,
      );
    }
  });

  it("2. thêm/bớt rule info không đổi decision", () => {
    // Code thứ MAX_LEN chưa dùng trong danh sách nào, để rule chèn vào không trùng code.
    const extra = codeAt(MAX_LEN);
    for (const list of LISTS.filter((l) => l.some(isBlock))) {
      const { decision } = route(list);

      const withoutInfo = list.filter(isBlock);
      expect(route(withoutInfo).decision, `bỏ info: ${show(list)}`).toBe(
        decision,
      );

      for (const passed of [true, false]) {
        for (let i = 0; i <= list.length; i++) {
          const withInfo = [
            ...list.slice(0, i),
            rule(extra, "info", passed),
            ...list.slice(i),
          ];
          expect(route(withInfo).decision, `chèn: ${show(withInfo)}`).toBe(
            decision,
          );
        }
      }
    }
  });

  it("3. reasons = code của rule block không qua (đúng thứ tự, không thừa, không thiếu)", () => {
    for (const list of LISTS.filter((l) => l.length > 0)) {
      const d = route(list);
      const expected = list
        .filter((r) => isBlock(r) && !r.passed)
        .map((r) => r.code);
      expect(d.reasons, show(list)).toEqual(
        d.decision === "auto_approve" ? [] : expected,
      );
    }
  });

  // Không có rule nào được chấm thì "mọi rule block đều qua" chỉ đúng một cách rỗng.
  // Không tự duyệt trên đó (Liam chốt 2026-11-04, plan 12c).
  it("ca biên: danh sách rỗng → needs_review + NO_RULES_EVALUATED", () => {
    expect(route([])).toEqual({
      decision: "needs_review",
      reasons: ["NO_RULES_EVALUATED"],
    });
  });
});

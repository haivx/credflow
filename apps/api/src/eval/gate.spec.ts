import type { EvalMetrics } from "@credflow/contracts";
import { describe, expect, it } from "vitest";
import { computeMetrics } from "./metrics.js";
import { checkGate, Gate } from "./gate.js";

const withFalseApproves = (count: number): EvalMetrics => ({
  ...computeMetrics([]),
  n: 10,
  falseApproveCount: count,
  falseApproveRate: count / 10,
});

describe("checkGate", () => {
  const gate = Gate.parse({ maxFalseApproveCount: 2 });

  it("dưới và đúng bằng mức cho phép: qua", () => {
    expect(checkGate(withFalseApproves(0), gate)).toEqual([]);
    expect(checkGate(withFalseApproves(2), gate)).toEqual([]);
  });

  it("vượt mức: một lỗi nói rõ số và mức", () => {
    const errors = checkGate(withFalseApproves(3), gate);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("3");
    expect(errors[0]).toContain("2");
  });

  it("mức 0: một ca duyệt nhầm cũng đỏ", () => {
    expect(
      checkGate(withFalseApproves(1), Gate.parse({ maxFalseApproveCount: 0 })),
    ).toHaveLength(1);
  });

  it("gate.json sai schema bị từ chối", () => {
    expect(Gate.safeParse({ maxFalseApproveCount: -1 }).success).toBe(false);
    expect(Gate.safeParse({}).success).toBe(false);
  });
});

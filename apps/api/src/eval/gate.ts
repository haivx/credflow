import type { EvalMetrics } from "@credflow/contracts";
import * as z from "zod";

/**
 * Mức chặn của `make eval-ci` (plan 20), đọc từ `eval/gate.json`. Đổi mức là sửa file đó trong PR,
 * nên luôn thấy trong diff.
 */
export const Gate = z.object({
  maxFalseApproveCount: z.number().int().min(0),
});
export type Gate = z.infer<typeof Gate>;

/** Danh sách vi phạm; rỗng là qua. Hàm thuần. */
export function checkGate(metrics: EvalMetrics, gate: Gate): string[] {
  const errors: string[] = [];
  if (metrics.falseApproveCount > gate.maxFalseApproveCount) {
    errors.push(
      `falseApproveCount ${String(metrics.falseApproveCount)} vượt mức cho phép ${String(gate.maxFalseApproveCount)} (eval/gate.json)`,
    );
  }
  return errors;
}

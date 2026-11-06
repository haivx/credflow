import type { Extraction, RoutingDecision } from "@credflow/contracts";
import { issuerMatches, nameMatches } from "@credflow/rules";

type Decision = RoutingDecision["decision"];

/**
 * So các trường có trong đáp án với extraction. Ngày so chuỗi `YYYY-MM-DD`; tên và tổ chức
 * dùng cùng hàm chuẩn hoá với rule engine; trường khác so sau khi `trim`.
 * Chỉ trả tên trường, không trả giá trị (data policy).
 */
export function compareFields(
  expected: Record<string, string | null>,
  extraction: Extraction | undefined,
): { compared: string[]; mismatches: string[] } {
  const compared = Object.keys(expected);
  const mismatches = compared.filter(
    (name) =>
      !fieldMatches(name, expected[name] ?? null, readValue(extraction, name)),
  );
  return { compared, mismatches };
}

/**
 * Duyệt nhầm (plan 18): bị tự duyệt mà đáp án nói phải chuyển người duyệt, hoặc tự duyệt một
 * giấy đọc sai trường chính. Chuyển người duyệt thì không bao giờ là duyệt nhầm.
 */
export function isFalseApprove(
  decision: Decision,
  expectedDecision: Decision,
  fieldMismatches: readonly string[],
): boolean {
  if (decision !== "auto_approve") return false;
  return expectedDecision === "needs_review" || fieldMismatches.length > 0;
}

function readValue(
  extraction: Extraction | undefined,
  name: string,
): string | null {
  if (extraction === undefined) return null;
  const fields: Record<string, { value: unknown } | undefined> =
    extraction.fields;
  const value = fields[name]?.value;
  return typeof value === "string" ? value : null;
}

function fieldMatches(
  name: string,
  expected: string | null,
  actual: string | null,
): boolean {
  if (expected === null || actual === null) return expected === actual;
  if (name === "holderName") return nameMatches(actual, [expected]);
  if (name === "issuerName") return issuerMatches(actual, [expected]);
  return actual.trim() === expected.trim();
}

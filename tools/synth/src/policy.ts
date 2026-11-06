import type { CaseTag } from "@credflow/contracts";

// Chính sách đáp án của synth (plan 19, Liam duyệt). Viết lại từ bảng kịch bản, KHÔNG gọi rule
// engine: đáp án phải độc lập với thứ đang được đo. Đổi bảng này là đổi chính sách, phải qua plan.

export type ScenarioKind =
  | "clean"
  | "rotated"
  | "blurred"
  | "skewed"
  | "expiring_soon"
  | "expired"
  | "issuer_not_accepted"
  | "name_variant_ok"
  | "name_variant_bad"
  | "other_person"
  | "validity_text"
  | "month_only"
  | "ambiguous_date";

export type Decision = "auto_approve" | "needs_review";

export interface Scenario {
  kind: ScenarioKind;
  count: number;
  tags: CaseTag[];
  decision: Decision;
}

/**
 * Tự duyệt chỉ khi sự thật của thẻ là: còn hạn, đúng người theo cách so tên đã chốt (không fuzzy),
 * tổ chức được chấp nhận, hạn đọc được không cần đoán. Ảnh nhiễu không đổi sự thật của thẻ.
 */
export const SCENARIOS: readonly Scenario[] = [
  { kind: "clean", count: 8, tags: ["clean"], decision: "auto_approve" },
  { kind: "rotated", count: 3, tags: ["rotated"], decision: "auto_approve" },
  { kind: "blurred", count: 3, tags: ["blurred"], decision: "auto_approve" },
  {
    kind: "skewed",
    count: 3,
    tags: ["skewed_photo"],
    decision: "auto_approve",
  },
  // EXPIRING_SOON là rule info: vẫn tự duyệt, kèm cảnh báo.
  {
    kind: "expiring_soon",
    count: 2,
    tags: ["clean"],
    decision: "auto_approve",
  },
  { kind: "expired", count: 4, tags: ["expired"], decision: "needs_review" },
  {
    kind: "issuer_not_accepted",
    count: 4,
    tags: ["issuer_not_accepted"],
    decision: "needs_review",
  },
  // "LAST, FIRST", alias đã khai, tên đệm viết tắt khi hồ sơ không có tên đệm.
  {
    kind: "name_variant_ok",
    count: 3,
    tags: ["name_variant"],
    decision: "auto_approve",
  },
  // Tên viết tắt chữ đầu, mất hậu tố "Jr.": có thể đúng người nhưng không chắc → người duyệt.
  {
    kind: "name_variant_bad",
    count: 2,
    tags: ["name_variant"],
    decision: "needs_review",
  },
  {
    kind: "other_person",
    count: 2,
    tags: ["name_variant"],
    decision: "needs_review",
  },
  // Chỉ in câu hiệu lực: hạn tính được chắc chắn từ ngày học.
  {
    kind: "validity_text",
    count: 2,
    tags: ["no_printed_expiry"],
    decision: "auto_approve",
  },
  // Chỉ in tháng/năm: ngày hết hạn phải suy luận.
  {
    kind: "month_only",
    count: 2,
    tags: ["no_printed_expiry"],
    decision: "needs_review",
  },
  {
    kind: "ambiguous_date",
    count: 2,
    tags: ["date_format_ambiguous"],
    decision: "needs_review",
  },
];

export function expectedDecision(kind: ScenarioKind): Decision {
  const scenario = SCENARIOS.find((s) => s.kind === kind);
  if (scenario === undefined) throw new Error(`Không có kịch bản ${kind}`);
  return scenario.decision;
}

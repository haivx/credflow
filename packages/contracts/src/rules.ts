import * as z from "zod";
import { DocType } from "./document.js";

// Đã chốt 2026-11-05 (plan 15). Thêm mã rule mới nghĩa là sửa contract.

export const RuleCode = z
  .enum([
    "WRONG_DOC_TYPE",
    "MISSING_FIELD",
    "MISSING_EVIDENCE",
    "LOW_CONFIDENCE",
    "DATE_INCONSISTENT",
    "EXPIRED",
    "EXPIRING_SOON",
    "NAME_MISMATCH",
    "ISSUER_NOT_ACCEPTED",
    "RESULT_NOT_PASSING",
    // Engine không chấm rule nào: lỗi hệ thống, không phải lỗi giấy. route([]) trả mã này.
    "NO_RULES_EVALUATED",
  ])
  .meta({ id: "RuleCode" });
export type RuleCode = z.infer<typeof RuleCode>;

/** `block`: không được tự duyệt. `info`: chỉ hiển thị. */
export const RuleSeverity = z
  .enum(["block", "info"])
  .meta({ id: "RuleSeverity" });

export const RuleResult = z
  .object({
    code: RuleCode,
    passed: z.boolean(),
    severity: RuleSeverity,
    /** Câu giải thích cho người duyệt. */
    message: z.string(),
    /** Trường liên quan, ví dụ ["expirationDate"]. */
    fieldRefs: z.array(z.string()).default([]),
  })
  .meta({ id: "RuleResult" });
export type RuleResult = z.infer<typeof RuleResult>;

/** Cấu hình rule theo khách hàng, đọc từ config/rules/*.yaml. Giá trị chỉ là minh hoạ. */
export const RulesConfig = z
  .object({
    version: z.literal(1),
    /** Dưới ngưỡng này ở bất kỳ trường bắt buộc nào → không tự duyệt. */
    minFieldConfidence: z.number().min(0).max(1),
    expiringSoonDays: z.number().int().min(0),
    roles: z.record(
      z.string(),
      z.object({ required: z.array(DocType).min(1) }),
    ),
    /** Hiệu lực mặc định khi giấy không in ngày hết hạn. */
    defaultValidityMonths: z.partialRecord(DocType, z.number().int().min(1)),
    acceptedIssuers: z.partialRecord(DocType, z.array(z.string().min(1))),
  })
  .meta({ id: "RulesConfig" });
export type RulesConfig = z.infer<typeof RulesConfig>;

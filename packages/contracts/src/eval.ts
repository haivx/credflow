import * as z from "zod";
import { Id, IsoDate, IsoTimestamp } from "./common.js";
import { DocType } from "./document.js";
import { Versions } from "./routing.js";
import { StaffProfile } from "./staff.js";

// Chốt 2026-11-06 (plan 18).

/** Nhãn mô tả độ khó của ca, để cắt metric theo nhóm. */
export const CaseTag = z
  .enum([
    "clean",
    "rotated",
    "blurred",
    "skewed_photo",
    "multi_page",
    "name_variant",
    "date_format_ambiguous",
    "no_printed_expiry",
    "expired",
    "wrong_doc_type",
    "issuer_not_accepted",
    "handwritten",
  ])
  .meta({ id: "CaseTag" });

/** Một ca trong golden set. `expected.fields` dùng cùng tên trường với Extraction. */
export const GoldenCase = z
  .object({
    id: Id,
    /** Đường dẫn tương đối tới file trong data/synth/ hoặc eval/hard-cases/. */
    file: z.string(),
    staff: StaffProfile,
    /** Ngày giả định "hôm nay" khi chấm, để rule hết hạn tái lập được. */
    asOf: IsoDate,
    /** Loại giấy staff khai lúc upload, nếu ca muốn kiểm WRONG_DOC_TYPE. */
    declaredDocType: DocType.optional(),
    expected: z.object({
      docType: DocType,
      fields: z.record(z.string(), z.string().nullable()),
      decision: z.enum(["auto_approve", "needs_review"]),
    }),
    tags: z.array(CaseTag).min(1),
    split: z.enum(["dev", "holdout"]),
  })
  .meta({ id: "GoldenCase" });
export type GoldenCase = z.infer<typeof GoldenCase>;
export type CaseTag = z.infer<typeof CaseTag>;

const Count = z.number().int().min(0);

export const EvalMetrics = z
  .object({
    n: Count,
    classificationAccuracy: z.number().min(0).max(1),
    /** Độ chính xác theo từng trường, khoá là tên trường. Chỉ tính ca có trường đó trong đáp án. */
    fieldAccuracy: z.record(z.string(), z.number().min(0).max(1)),
    /**
     * Metric quan trọng nhất, mục tiêu 0. Ca bị tự duyệt mà đáp án là `needs_review`,
     * hoặc có trường chính đọc sai so với đáp án (plan 18).
     */
    falseApproveCount: Count,
    falseApproveRate: z.number().min(0).max(1),
    autoApproveRate: z.number().min(0).max(1),
    /** Lượt gọi LLM thật trong lần chạy này; ca lấy từ cache không tính. */
    llmCalls: Count,
    cacheHits: Count,
    inputTokens: Count,
    outputTokens: Count,
    /** Ước tính theo bảng giá ghi trong code; tính cả ca lấy từ cache (chi phí lúc gọi thật). */
    costUsdTotal: z.number().min(0),
    costUsdPerDoc: z.number().min(0),
    latencyMsP50: z.number().min(0),
    latencyMsP95: z.number().min(0),
  })
  .meta({ id: "EvalMetrics" });
export type EvalMetrics = z.infer<typeof EvalMetrics>;

/** Kết quả một ca, để report liệt kê ca sai mà không phải chạy lại. */
export const EvalCaseResult = z
  .object({
    id: Id,
    tags: z.array(CaseTag),
    expectedDecision: z.enum(["auto_approve", "needs_review"]),
    decision: z.enum(["auto_approve", "needs_review"]),
    /** Lý do routing (mã rule block không qua, hoặc NO_RULES_EVALUATED). */
    reasons: z.array(z.string()),
    expectedDocType: DocType,
    docType: DocType.nullable(),
    falseApprove: z.boolean(),
    /** Trường chính đọc sai so với đáp án. Chỉ ghi tên trường, không ghi giá trị (data policy). */
    fieldMismatches: z.array(z.string()),
    fieldsCompared: z.array(z.string()),
    /** Lỗi LLM không retry được; ca vẫn chấm như pipeline thật (needs_review). */
    error: z.string().nullable(),
    cached: z.boolean(),
    /** Lượt gọi LLM thật của ca trong lần chạy này (0 khi lấy từ cache). */
    llmCalls: Count,
    latencyMs: z.number().min(0),
    inputTokens: Count,
    outputTokens: Count,
  })
  .meta({ id: "EvalCaseResult" });
export type EvalCaseResult = z.infer<typeof EvalCaseResult>;

export const EvalRun = z
  .object({
    id: Id,
    createdAt: IsoTimestamp,
    split: z.enum(["dev", "holdout"]),
    versions: Versions,
    /** Tổng thời gian chạy (đồng hồ thật), gồm cả ca lấy từ cache. */
    durationMs: z.number().min(0),
    metrics: EvalMetrics,
    byTag: z.record(z.string(), EvalMetrics).default({}),
    cases: z.array(EvalCaseResult),
    /** Lần chạy cùng split ngay trước, để report so sánh. */
    previousRunId: Id.optional(),
  })
  .meta({ id: "EvalRun" });
export type EvalRun = z.infer<typeof EvalRun>;

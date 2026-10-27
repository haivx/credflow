import * as z from "zod";
import { Id, IsoDate, IsoTimestamp } from "./common";
import { DocType } from "./document";
import { Versions } from "./routing";
import { StaffProfile } from "./staff";

// BẢN NHÁP: Liam chốt ở P2.

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

export const EvalMetrics = z
  .object({
    n: z.number().int().min(0),
    classificationAccuracy: z.number().min(0).max(1),
    /** Độ chính xác theo từng trường, khoá là tên trường. */
    fieldAccuracy: z.record(z.string(), z.number().min(0).max(1)),
    /** Metric quan trọng nhất: ca đáng lẽ phải người duyệt nhưng bị tự duyệt. Mục tiêu 0. */
    falseApproveRate: z.number().min(0).max(1),
    autoApproveRate: z.number().min(0).max(1),
    costUsdPerDoc: z.number().min(0),
    latencyMsP50: z.number().min(0),
    latencyMsP95: z.number().min(0),
  })
  .meta({ id: "EvalMetrics" });

export const EvalRun = z
  .object({
    id: Id,
    createdAt: IsoTimestamp,
    split: z.enum(["dev", "holdout"]),
    versions: Versions,
    metrics: EvalMetrics,
    byTag: z.record(z.string(), EvalMetrics).default({}),
  })
  .meta({ id: "EvalRun" });
export type EvalRun = z.infer<typeof EvalRun>;

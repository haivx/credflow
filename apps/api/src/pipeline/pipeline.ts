import type {
  Classification,
  Extraction,
  RoutingDecision,
  RuleResult,
} from "@credflow/contracts";
import { LLM_MODEL } from "../llm/llm.service.js";
import { PROMPT_VERSION } from "../llm/prompts.js";

export const PIPELINE = Symbol("PIPELINE");

/** Đọc được thẻ: worker ghi `extracted` rồi mới chạy rule (`RuleStep`). */
export interface ExtractedResult {
  status: "extracted";
  classification: Classification;
  extraction: Extraction;
  timingMs: Record<string, number>;
}

/** Không có gì để chấm rule (loại giấy chưa hỗ trợ, LLM lỗi không đáng retry): chuyển người duyệt. */
export interface NeedsReviewResult {
  status: "needs_review";
  routing: RoutingDecision;
  ruleResults: RuleResult[];
  classification?: Classification;
  extraction?: Extraction;
  timingMs?: Record<string, number>;
  /** Lỗi không đáng thử lại: vẫn chuyển người duyệt, kèm phần đã đọc được. */
  error?: { step: string; message: string };
}

export type PipelineResult = ExtractedResult | NeedsReviewResult;

/** Xử lý một document. Lỗi tạm thì ném lỗi thường để job retry. */
export interface Pipeline {
  run(documentId: string): Promise<PipelineResult>;
}

/** File không đọc được: retry vô ích, document sang `failed` để staff nộp lại. */
export class UnreadableFileError extends Error {
  constructor() {
    super("File không đọc được");
    this.name = "UnreadableFileError";
  }
}

/** Ghi lúc vào `processing`. Phần `rules` lấy từ config đang chạy. */
export const PIPELINE_VERSIONS = {
  pipeline: "16",
  prompt: PROMPT_VERSION,
  model: LLM_MODEL,
};

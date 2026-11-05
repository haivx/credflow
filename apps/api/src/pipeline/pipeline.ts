import { Injectable } from "@nestjs/common";
import type { RoutingDecision, RuleResult } from "@credflow/contracts";
import { route } from "@credflow/rules";

export const PIPELINE = Symbol("PIPELINE");

export interface PipelineResult {
  status: "needs_review";
  routing: RoutingDecision;
  ruleResults: RuleResult[];
}

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

/** Giá trị `versions` của stub. Plan LLM thay bằng phiên bản prompt và model thật. */
export const PIPELINE_VERSIONS = {
  pipeline: "12-stub",
  prompt: "none",
  model: "none",
};

/**
 * Chưa gọi LLM (plan 12). Chưa rule nào được chấm nên `route([])` chuyển cho người duyệt,
 * nên stub không có đường tới `auto_approved`.
 */
@Injectable()
export class StubPipeline implements Pipeline {
  run(): Promise<PipelineResult> {
    return Promise.resolve({
      status: "needs_review",
      routing: route([]),
      ruleResults: [],
    });
  }
}

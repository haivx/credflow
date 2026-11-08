import { AuthUser } from "./auth.js";
import { Classification, DocType } from "./document.js";
import { ApiError } from "./error.js";
import { Extraction } from "./extraction.js";
import { EvalCaseResult, EvalRun, GoldenCase } from "./eval.js";
import {
  DocumentList,
  DocumentRecord,
  DocumentView,
  ReviewAction,
  RoutingDecision,
  UploadDocumentResponse,
} from "./routing.js";
import {
  DecisionResponse,
  PreviewResponse,
  ReviewDocumentDetail,
  ReviewQueuePage,
} from "./review.js";
import { RuleResult, RulesConfig } from "./rules.js";
import { LlmSettingsView } from "./settings.js";
import { StaffCompliance, StaffProfile } from "./staff.js";

export * from "./common.js";
export * from "./document.js";
export * from "./extraction.js";
export * from "./staff.js";
export * from "./rules.js";
export * from "./routing.js";
export * from "./review.js";
export * from "./eval.js";
export * from "./error.js";
export * from "./auth.js";
export * from "./parse-json.js";
export * from "./jobs.js";
export * from "./settings.js";

/** Các kiểu đi qua ranh giới I/O. Fixture trong fixtures/<Tên>.json phải parse được. */
export const Schemas = {
  DocType,
  Classification,
  Extraction,
  StaffProfile,
  StaffCompliance,
  RuleResult,
  RulesConfig,
  RoutingDecision,
  DocumentRecord,
  DocumentView,
  DocumentList,
  ReviewAction,
  GoldenCase,
  EvalRun,
  EvalCaseResult,
  ApiError,
  AuthUser,
  UploadDocumentResponse,
  ReviewQueuePage,
  ReviewDocumentDetail,
  PreviewResponse,
  DecisionResponse,
  LlmSettingsView,
} as const;
export type SchemaName = keyof typeof Schemas;

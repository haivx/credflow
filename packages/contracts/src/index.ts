import { Classification, DocType } from "./document.js";
import { Extraction } from "./extraction.js";
import { EvalRun, GoldenCase } from "./eval.js";
import { DocumentRecord, ReviewAction, RoutingDecision } from "./routing.js";
import { RuleResult, RulesConfig } from "./rules.js";
import { StaffProfile } from "./staff.js";

export * from "./common.js";
export * from "./document.js";
export * from "./extraction.js";
export * from "./staff.js";
export * from "./rules.js";
export * from "./routing.js";
export * from "./eval.js";

/** Các kiểu đi qua ranh giới I/O. Fixture trong fixtures/<Tên>.json phải parse được. */
export const Schemas = {
  DocType,
  Classification,
  Extraction,
  StaffProfile,
  RuleResult,
  RulesConfig,
  RoutingDecision,
  DocumentRecord,
  ReviewAction,
  GoldenCase,
  EvalRun,
} as const;
export type SchemaName = keyof typeof Schemas;

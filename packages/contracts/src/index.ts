import { Classification, DocType } from "./document";
import { Extraction } from "./extraction";
import { EvalRun, GoldenCase } from "./eval";
import { DocumentRecord, ReviewAction, RoutingDecision } from "./routing";
import { RuleResult, RulesConfig } from "./rules";
import { StaffProfile } from "./staff";

export * from "./common";
export * from "./document";
export * from "./extraction";
export * from "./staff";
export * from "./rules";
export * from "./routing";
export * from "./eval";

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

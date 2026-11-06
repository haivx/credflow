import { Logger } from "@nestjs/common";
import {
  type Classification,
  type DocType,
  type Extraction,
  type RoutingDecision,
  type RuleResult,
  StaffProfile,
} from "@credflow/contracts";
import {
  configsFor,
  evaluateRulesForConfigs,
  type RulesConfigSet,
  route,
} from "@credflow/rules";
import { eq } from "drizzle-orm";
import type { Db } from "../db/db.provider.js";
import { staff } from "../db/schema.js";

export interface ScoreInput {
  documentId: string;
  staffId: string;
  extraction: Extraction;
  classification: Classification;
  declaredDocType?: DocType | undefined;
  asOf: string;
}

export interface ScoreResult {
  ruleResults: RuleResult[];
  routing: RoutingDecision;
}

const logger = new Logger("RuleScorer");

/**
 * Chấm rule cho một giấy theo mọi khách hàng của staff (plan 25, ADR 0011). Worker (`RuleStep`) và
 * preview của người duyệt (plan 27) cùng gọi hàm này, để hai bên chấm đúng một cách.
 * Chỉ đọc hồ sơ staff, không ghi DB; `asOf` do caller truyền. Hàm thường, không phải provider:
 * caller tự inject `DB` và `RULES_CONFIG`.
 */
export async function scoreDocument(
  db: Db,
  configs: RulesConfigSet,
  input: ScoreInput,
): Promise<ScoreResult> {
  const [staffRow] = await db
    .select({
      id: staff.id,
      legalName: staff.legalName,
      aliases: staff.aliases,
      role: staff.role,
      clientIds: staff.clientIds,
      region: staff.region,
    })
    .from(staff)
    .where(eq(staff.id, input.staffId));
  if (staffRow === undefined) throw new Error("Không có staff");

  const profile = StaffProfile.parse(staffRow);
  const missing = profile.clientIds.filter(
    (id) => configs.byClient[id] === undefined,
  );
  if (missing.length > 0) {
    // Khách hàng chưa có file config: chấm theo default cho khách đó (plan 25). Chỉ ghi id.
    logger.warn(
      `document ${input.documentId}: khách hàng chưa có config riêng, dùng default: ${missing.join(", ")}`,
    );
  }
  const ruleResults = evaluateRulesForConfigs(
    {
      extraction: input.extraction,
      classification: input.classification,
      declaredDocType: input.declaredDocType,
      staff: profile,
      asOf: input.asOf,
    },
    configsFor(configs, profile.clientIds),
  );
  return { ruleResults, routing: route(ruleResults) };
}

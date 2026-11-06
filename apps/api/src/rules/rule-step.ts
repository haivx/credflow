import { Inject, Injectable, Logger } from "@nestjs/common";
import {
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
import { CLOCK, type Clock } from "../common/clock.js";
import { type Db, DB } from "../db/db.provider.js";
import { documents, staff } from "../db/schema.js";
import { RULES_CONFIG } from "./rules-config.provider.js";

export interface RuleStepResult {
  status: "auto_approved" | "needs_review";
  routing: RoutingDecision;
  ruleResults: RuleResult[];
  asOf: string;
  timingMs: Record<string, number>;
}

/**
 * Chỉ hai nhánh, và chỉ `auto_approve` mới ra `auto_approved`. Hệ thống không bao giờ tự từ chối.
 */
export function statusFor(
  decision: RoutingDecision["decision"],
): RuleStepResult["status"] {
  return decision === "auto_approve" ? "auto_approved" : "needs_review";
}

/**
 * Chấm rule cho document đang ở `extracted`. Không gọi LLM, không ghi DB: chạy lại bao nhiêu lần
 * cũng được, nên job retry sau khi worker chết ở `extracted` chỉ cần gọi lại bước này.
 */
@Injectable()
export class RuleStep {
  private readonly logger = new Logger("RuleStep");

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(RULES_CONFIG) private readonly configs: RulesConfigSet,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async run(documentId: string): Promise<RuleStepResult> {
    const [doc] = await this.db
      .select({
        staffId: documents.staffId,
        declaredDocType: documents.declaredDocType,
        classification: documents.classification,
        extraction: documents.extraction,
        timingMs: documents.timingMs,
      })
      .from(documents)
      .where(eq(documents.id, documentId));
    if (doc === undefined) throw new Error("Không có document");
    // CHECK C4 bảo đảm `extracted` có cả hai; tới đây mà thiếu là bug.
    if (doc.classification === null || doc.extraction === null) {
      throw new Error("Document chưa có kết quả trích xuất");
    }

    const [staffRow] = await this.db
      .select({
        id: staff.id,
        legalName: staff.legalName,
        aliases: staff.aliases,
        role: staff.role,
        clientIds: staff.clientIds,
        region: staff.region,
      })
      .from(staff)
      .where(eq(staff.id, doc.staffId));
    if (staffRow === undefined) throw new Error("Không có staff");

    const asOf = this.clock.todayUtc();
    const startedAt = performance.now();
    const profile = StaffProfile.parse(staffRow);
    const missing = profile.clientIds.filter(
      (id) => this.configs.byClient[id] === undefined,
    );
    if (missing.length > 0) {
      // Khách hàng chưa có file config: chấm theo default cho khách đó (plan 25). Chỉ ghi id.
      this.logger.warn(
        `document ${documentId}: khách hàng chưa có config riêng, dùng default: ${missing.join(", ")}`,
      );
    }
    // Chấm theo mọi khách hàng của staff, lấy chặt nhất (plan 25, ADR 0011).
    const ruleResults = evaluateRulesForConfigs(
      {
        extraction: doc.extraction,
        classification: doc.classification,
        declaredDocType: doc.declaredDocType ?? undefined,
        staff: profile,
        asOf,
      },
      configsFor(this.configs, profile.clientIds),
    );
    const routing = route(ruleResults);

    return {
      status: statusFor(routing.decision),
      routing,
      ruleResults,
      asOf,
      timingMs: {
        ...doc.timingMs,
        rules: Math.round(performance.now() - startedAt),
      },
    };
  }
}

import { Inject, Injectable } from "@nestjs/common";
import {
  DocType,
  type StaffCompliance,
  type StaffListQuery,
} from "@credflow/contracts";
import {
  configsFor,
  requiredDocTypes,
  type RulesConfigSet,
} from "@credflow/rules";
import { RULES_CONFIG } from "../rules/rules-config.provider.js";
import { presentDocTypesQuery } from "./compliance.sql.js";
import { and, eq } from "drizzle-orm";
import { type Db, DB } from "../db/db.provider.js";
import { staff } from "../db/schema.js";

const profileColumns = {
  id: staff.id,
  legalName: staff.legalName,
  role: staff.role,
  aliases: staff.aliases,
  clientIds: staff.clientIds,
  region: staff.region,
};

@Injectable()
export class StaffService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(RULES_CONFIG) private readonly configs: RulesConfigSet,
  ) {}

  list(filter: StaffListQuery = {}) {
    return this.db
      .select(profileColumns)
      .from(staff)
      .where(
        and(
          filter.role === undefined ? undefined : eq(staff.role, filter.role),
          filter.region === undefined
            ? undefined
            : eq(staff.region, filter.region),
        ),
      )
      .orderBy(staff.legalName);
  }

  /** Không có thì trả undefined; controller quyết định 404. */
  async findById(id: string) {
    const [row] = await this.db
      .select(profileColumns)
      .from(staff)
      .where(eq(staff.id, id));
    return row;
  }

  /**
   * Staff đã đủ bộ giấy chưa (plan 26). Không có staff thì undefined; controller quyết định 404.
   * Chưa xét hạn: giấy đã duyệt là "đã có" (P5 mới xét hạn).
   */
  async compliance(id: string): Promise<StaffCompliance | undefined> {
    const profile = await this.findById(id);
    if (profile === undefined) return undefined;

    const configs = configsFor(this.configs, profile.clientIds);
    const required = requiredDocTypes(configs, profile.role);
    const result = await this.db.execute(presentDocTypesQuery(id));
    // Cột jsonb có thể chứa giá trị lạ (dữ liệu cũ): chỉ giữ loại giấy hợp lệ của contract.
    const presentSet = new Set(
      result.rows.flatMap((row) => {
        const parsed = DocType.safeParse(row.doc_type);
        return parsed.success ? [parsed.data] : [];
      }),
    );
    const present = DocType.options.filter((t) => presentSet.has(t));
    const base = {
      staffId: profile.id,
      role: profile.role,
      present,
      configs: configs.map((c) => c.name),
    };
    if (required === undefined) {
      return { ...base, status: "unknown_role", required: [], missing: [] };
    }
    const missing = required.filter((t) => !presentSet.has(t));
    return {
      ...base,
      status: missing.length === 0 ? "complete" : "incomplete",
      required,
      missing,
    };
  }
}

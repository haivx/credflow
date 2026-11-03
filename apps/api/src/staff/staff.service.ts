import { Inject, Injectable } from "@nestjs/common";
import type { StaffListQuery } from "@credflow/contracts";
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
  constructor(@Inject(DB) private readonly db: Db) {}

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
}

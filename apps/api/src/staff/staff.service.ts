import { Inject, Injectable } from "@nestjs/common";
import { type Db, DB } from "../db/db.provider.js";
import { staff } from "../db/schema.js";

@Injectable()
export class StaffService {
  constructor(@Inject(DB) private readonly db: Db) {}

  list() {
    return this.db
      .select({
        id: staff.id,
        legalName: staff.legalName,
        role: staff.role,
        aliases: staff.aliases,
        clientIds: staff.clientIds,
        region: staff.region,
      })
      .from(staff)
      .orderBy(staff.legalName);
  }
}

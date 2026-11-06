import { Inject, Injectable } from "@nestjs/common";
import { DocumentView } from "@credflow/contracts";
import { and, desc, eq } from "drizzle-orm";
import { type Db, DB } from "../db/db.provider.js";
import { documents } from "../db/schema.js";

/** P1 chưa phân trang: staff có ít giấy. */
export const DOCUMENT_LIST_LIMIT = 50;

/** Cột trả cho staff. Không chọn `storageKey`, `checksum` ngay từ query (plan 17). */
export const viewColumns = {
  id: documents.id,
  staffId: documents.staffId,
  fileName: documents.fileName,
  mimeType: documents.mimeType,
  sizeBytes: documents.sizeBytes,
  declaredDocType: documents.declaredDocType,
  status: documents.status,
  version: documents.version,
  classification: documents.classification,
  extraction: documents.extraction,
  ruleResults: documents.ruleResults,
  routing: documents.routing,
  versions: documents.versions,
  asOf: documents.asOf,
  timingMs: documents.timingMs,
  error: documents.error,
  createdAt: documents.createdAt,
  updatedAt: documents.updatedAt,
};

/** Đọc giấy của một staff. Mọi query đều lọc theo `staffId`: không có đường đọc giấy người khác. */
@Injectable()
export class DocumentsReadService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async listForStaff(staffId: string): Promise<DocumentView[]> {
    const rows = await this.db
      .select(viewColumns)
      .from(documents)
      .where(eq(documents.staffId, staffId))
      .orderBy(desc(documents.createdAt), desc(documents.id))
      .limit(DOCUMENT_LIST_LIMIT);
    return rows.map(toView);
  }

  /** `undefined` khi không có, hoặc giấy thuộc staff khác: caller trả cùng một 404. */
  async findForStaff(
    staffId: string,
    id: string,
  ): Promise<DocumentView | undefined> {
    const [row] = await this.db
      .select(viewColumns)
      .from(documents)
      .where(and(eq(documents.id, id), eq(documents.staffId, staffId)));
    return row === undefined ? undefined : toView(row);
  }

  /** File của giấy thuộc staff này (plan 27). `undefined` cùng nghĩa như `findForStaff`. */
  async fileMetaForStaff(
    staffId: string,
    id: string,
  ): Promise<{ storageKey: string; mimeType: string } | undefined> {
    const [row] = await this.db
      .select({
        storageKey: documents.storageKey,
        mimeType: documents.mimeType,
      })
      .from(documents)
      .where(and(eq(documents.id, id), eq(documents.staffId, staffId)));
    return row;
  }
}

/** DB dùng NULL, contract dùng trường vắng mặt; timestamp đổi sang chuỗi ISO. */
export function toView(
  row: Record<string, unknown> & { createdAt: Date; updatedAt: Date },
): DocumentView {
  const present = Object.fromEntries(
    Object.entries(row).filter(([, value]) => value !== null),
  );
  return DocumentView.parse({
    ...present,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

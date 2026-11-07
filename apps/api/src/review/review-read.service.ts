import { Inject, Injectable } from "@nestjs/common";
import {
  type DocumentView,
  type ReviewQueueItem,
  ReviewQueueItem as ReviewQueueItemSchema,
  type ReviewQueuePage,
  type ReviewQueueQuery,
} from "@credflow/contracts";
import { and, asc, eq, type SQL, sql } from "drizzle-orm";
import { type Db, DB } from "../db/db.provider.js";
import { documents, staff } from "../db/schema.js";
import {
  latestReviews,
  toView,
  viewColumns,
} from "../documents/documents-read.service.js";
import { decodeCursor, encodeCursor } from "./queue-cursor.js";

/**
 * Khoá sắp theo hạn: ngày hết hạn đã trích xuất, không có thì xếp cuối. Phải khớp đúng biểu thức của
 * index `documents_review_queue_due_idx` (schema.ts) thì planner mới dùng index.
 * Chỉ đúng cho loại giấy có `expirationDate` (CPR); P5 thêm loại khác thì xem lại.
 */
const QUEUE_DUE_KEY = sql<string>`COALESCE(${documents.extraction} -> 'fields' -> 'expirationDate' ->> 'value', '9999-12-31')`;

/** Cursor hỏng hoặc của bộ lọc khác. Controller trả 400. */
export class InvalidCursorError extends Error {
  constructor() {
    super("Cursor không hợp lệ");
    this.name = "InvalidCursorError";
  }
}

/** Đọc cho người duyệt: xem được giấy của mọi staff (khác `DocumentsReadService` chỉ đọc giấy của mình). */
@Injectable()
export class ReviewReadService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** Hàng chờ `needs_review`, keyset `(khoá, id)`: duyệt bớt ca giữa chừng không làm trượt trang. */
  async queue(query: ReviewQueueQuery): Promise<ReviewQueuePage> {
    const reason = query.reason ?? null;
    const cursor =
      query.cursor === undefined
        ? undefined
        : decodeCursor(query.cursor, { sort: query.sort, reason });
    if (query.cursor !== undefined && cursor === undefined) {
      throw new InvalidCursorError();
    }

    // `created_at::text`: giữ đủ micro giây cho cursor (xem queue-cursor.ts).
    const sortKey =
      query.sort === "due"
        ? QUEUE_DUE_KEY
        : sql<string>`${documents.createdAt}::text`;
    const conditions: SQL[] = [eq(documents.status, "needs_review")];
    if (reason !== null) {
      conditions.push(
        sql`${documents.routing} -> 'reasons' @> ${JSON.stringify([reason])}::jsonb`,
      );
    }
    if (cursor !== undefined) {
      conditions.push(
        query.sort === "due"
          ? sql`(${QUEUE_DUE_KEY}, ${documents.id}) > (${cursor.k}, ${cursor.id})`
          : sql`(${documents.createdAt}, ${documents.id}) > (${cursor.k}::timestamptz, ${cursor.id})`,
      );
    }

    const rows = await this.db
      .select({
        id: documents.id,
        staffId: documents.staffId,
        staffName: staff.legalName,
        fileName: documents.fileName,
        docType: sql<string | null>`${documents.classification} ->> 'docType'`,
        reasons: sql<unknown>`COALESCE(${documents.routing} -> 'reasons', '[]'::jsonb)`,
        dueDate: sql<
          string | null
        >`${documents.extraction} -> 'fields' -> 'expirationDate' ->> 'value'`,
        createdAt: documents.createdAt,
        version: documents.version,
        sortKey,
      })
      .from(documents)
      .innerJoin(staff, eq(staff.id, documents.staffId))
      .where(and(...conditions))
      .orderBy(
        asc(query.sort === "due" ? QUEUE_DUE_KEY : documents.createdAt),
        asc(documents.id),
      )
      .limit(query.limit + 1);

    const page = rows.slice(0, query.limit);
    const last = page.at(-1);
    const nextCursor =
      rows.length > query.limit && last !== undefined
        ? encodeCursor({
            sort: query.sort,
            reason,
            k: last.sortKey,
            id: last.id,
          })
        : null;
    return {
      // Parse bỏ key lạ, nên `sortKey` (chỉ dùng cho cursor) không ra response.
      items: page.map((row): ReviewQueueItem =>
        ReviewQueueItemSchema.parse({
          ...row,
          createdAt: row.createdAt.toISOString(),
        }),
      ),
      nextCursor,
    };
  }

  /** Giấy + hồ sơ staff rút gọn. `undefined` khi không có. */
  async findDocument(id: string): Promise<
    | {
        document: DocumentView;
        staff: { id: string; legalName: string; clientIds: string[] };
      }
    | undefined
  > {
    const [row] = await this.db
      .select({
        doc: viewColumns,
        staff: {
          id: staff.id,
          legalName: staff.legalName,
          clientIds: staff.clientIds,
        },
      })
      .from(documents)
      .innerJoin(staff, eq(staff.id, documents.staffId))
      .where(eq(documents.id, id));
    if (row === undefined) return undefined;
    const reviews = await latestReviews(this.db, [id]);
    return { document: toView(row.doc, reviews.get(id)), staff: row.staff };
  }

  /** Thông tin để stream file. `staffId` để route của staff kiểm chủ sở hữu. */
  async fileMeta(
    id: string,
  ): Promise<
    { staffId: string; storageKey: string; mimeType: string } | undefined
  > {
    const [row] = await this.db
      .select({
        staffId: documents.staffId,
        storageKey: documents.storageKey,
        mimeType: documents.mimeType,
      })
      .from(documents)
      .where(eq(documents.id, id));
    return row;
  }
}

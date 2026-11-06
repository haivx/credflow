import { Inject, Injectable } from "@nestjs/common";
import type {
  Classification,
  DocumentStatus,
  Extraction,
  RoutingDecision,
  RuleResult,
  Versions,
} from "@credflow/contracts";
import { and, eq, sql } from "drizzle-orm";
import { type Db, DB } from "../db/db.provider.js";
import { documents } from "../db/schema.js";
import { assertTransition } from "./state-machine.js";

/** Các cột được ghi cùng lúc đổi trạng thái. */
export interface TransitionFields {
  versions?: Versions;
  routing?: RoutingDecision;
  ruleResults?: RuleResult[];
  classification?: Classification;
  extraction?: Extraction;
  timingMs?: Record<string, number>;
  asOf?: string;
  error?: { step: string; message: string };
}

/** Transaction drizzle (tham số của callback `db.transaction`). */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export interface TransitionOptions {
  /** Ghi trong transaction của caller (plan 27: quyết định + review_actions). */
  tx?: Db | Tx;
  /** Optimistic lock: chỉ ghi khi `version` còn đúng giá trị này. */
  expectedVersion?: number;
}

/** Dòng không còn ở trạng thái `from`: process khác đã đổi nó, hoặc document không tồn tại. */
export class DocumentStatusConflictError extends Error {
  constructor(
    readonly documentId: string,
    readonly from: DocumentStatus,
    readonly to: DocumentStatus,
  ) {
    super(
      `Document ${documentId} không còn ở ${from}, không chuyển sang ${to}`,
    );
    this.name = "DocumentStatusConflictError";
  }
}

/** Nơi duy nhất ghi `documents.status` (A11, lint A11_NO_STATUS_WRITE). */
@Injectable()
export class DocumentStatusService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async transition(
    documentId: string,
    from: DocumentStatus,
    to: DocumentStatus,
    fields: TransitionFields = {},
    actor?: { reviewerId?: string },
    opts: TransitionOptions = {},
  ): Promise<{ version: number }> {
    assertTransition(from, to, actor);

    // `status = from` trong WHERE: `assertTransition` chỉ kiểm giá trị được truyền vào, có thể đã cũ.
    // Điều kiện này do Postgres kiểm lúc ghi, nên hai process đua nhau thì chỉ một bên thắng.
    // `version = :v` (plan 27) cũng vậy: so ở Node sau khi đọc thì hai request cùng qua.
    const conditions = [
      eq(documents.id, documentId),
      eq(documents.status, from),
    ];
    if (opts.expectedVersion !== undefined) {
      conditions.push(eq(documents.version, opts.expectedVersion));
    }
    const rows = await (opts.tx ?? this.db)
      .update(documents)
      .set({
        status: to,
        updatedAt: new Date(),
        ...fields,
        // Mọi lần đổi trạng thái đều tăng, kể cả worker và sweep: quyết định dựa trên bản cũ thì 409.
        version: sql`${documents.version} + 1`,
      })
      .where(and(...conditions))
      .returning({ version: documents.version });

    const [row] = rows;
    if (row === undefined) {
      throw new DocumentStatusConflictError(documentId, from, to);
    }
    return row;
  }
}

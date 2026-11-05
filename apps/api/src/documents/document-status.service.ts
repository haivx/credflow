import { Inject, Injectable } from "@nestjs/common";
import type {
  Classification,
  DocumentStatus,
  Extraction,
  RoutingDecision,
  RuleResult,
  Versions,
} from "@credflow/contracts";
import { and, eq } from "drizzle-orm";
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
  error?: { step: string; message: string };
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
  ): Promise<void> {
    assertTransition(from, to, actor);

    // `status = from` trong WHERE: `assertTransition` chỉ kiểm giá trị được truyền vào, có thể đã cũ.
    // Điều kiện này do Postgres kiểm lúc ghi, nên hai process đua nhau thì chỉ một bên thắng.
    const rows = await this.db
      .update(documents)
      .set({ status: to, updatedAt: new Date(), ...fields })
      .where(and(eq(documents.id, documentId), eq(documents.status, from)))
      .returning({ id: documents.id });

    if (rows.length === 0) {
      throw new DocumentStatusConflictError(documentId, from, to);
    }
  }
}

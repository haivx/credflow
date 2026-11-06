import { type SQL, sql } from "drizzle-orm";

/**
 * Loại giấy staff đã có (plan 26): giấy đã tự duyệt hoặc người duyệt duyệt, nhóm theo
 * `classification->>'docType'`. Dùng chung cho service và test EXPLAIN, để test đo đúng câu chạy
 * thật. Khớp partial index `documents_staff_approved_doctype_idx` (cùng biểu thức, cùng điều kiện).
 */
export function presentDocTypesQuery(staffId: string): SQL {
  return sql`
    SELECT classification->>'docType' AS doc_type, count(*)::int AS n
    FROM documents
    WHERE staff_id = ${staffId} AND status IN ('auto_approved', 'approved')
    GROUP BY 1`;
}

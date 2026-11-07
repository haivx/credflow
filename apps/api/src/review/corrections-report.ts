import { ReviewActionKind } from "@credflow/contracts";
import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "../db/db.provider.js";

/**
 * Báo cáo "trường hay bị sửa nhất" (plan 29), đọc từ `review_actions.corrections`.
 * Kiểu cục bộ, không vào contract: chỉ script CLI dùng (`make report-corrections`).
 */
export interface FieldCorrectionStat {
  /** Dạng `fields.<tên>.value`. */
  fieldPath: string;
  /** Số lần sửa (một giấy có nhiều action sửa cùng trường thì đếm nhiều lần). */
  corrections: number;
  /** Số giấy khác nhau bị sửa trường này. */
  documents: number;
  /** `before` null: AI để trống, người điền vào. */
  filledEmpty: number;
  /** Cả `before` và `after` có giá trị: AI đọc sai. */
  changed: number;
  /** `after` null: người xoá giá trị AI đưa ra. */
  cleared: number;
}

export interface CorrectionsReport {
  /** Số giấy có ít nhất một `review_actions`. */
  reviewedDocuments: number;
  actions: Record<ReviewActionKind, number>;
  /** Sắp theo số lần sửa giảm dần, rồi `fieldPath`. */
  fields: FieldCorrectionStat[];
}

// count() của Postgres là bigint, driver pg trả chuỗi: ép ::int trong SQL, Zod kiểm lại.
const Count = z.number().int().min(0);
const ActionRow = z.object({ action: ReviewActionKind, n: Count });
const DocumentsRow = z.object({ n: Count });
const FieldRow = z.object({
  field_path: z.string(),
  corrections: Count,
  documents: Count,
  filled_empty: Count,
  changed: Count,
  cleared: Count,
});

export async function loadCorrectionsReport(
  db: Db,
): Promise<CorrectionsReport> {
  const actionRows = await db.execute(sql`
    SELECT action, count(*)::int AS n FROM review_actions GROUP BY action`);
  const docRows = await db.execute(sql`
    SELECT count(DISTINCT document_id)::int AS n FROM review_actions`);
  // Mỗi phần tử của mảng jsonb thành một dòng (LATERAL), rồi nhóm theo fieldPath.
  const fieldRows = await db.execute(sql`
    SELECT c->>'fieldPath' AS field_path,
           count(*)::int AS corrections,
           count(DISTINCT ra.document_id)::int AS documents,
           count(*) FILTER (WHERE c->'before' = 'null'::jsonb)::int AS filled_empty,
           count(*) FILTER (WHERE c->'before' <> 'null'::jsonb
                              AND c->'after' <> 'null'::jsonb)::int AS changed,
           count(*) FILTER (WHERE c->'before' <> 'null'::jsonb
                              AND c->'after' = 'null'::jsonb)::int AS cleared
    FROM review_actions ra
    CROSS JOIN LATERAL jsonb_array_elements(ra.corrections) AS c
    GROUP BY 1
    ORDER BY corrections DESC, field_path ASC`);

  const actions: Record<ReviewActionKind, number> = {
    approve: 0,
    reject: 0,
    request_reupload: 0,
  };
  for (const row of actionRows.rows) {
    const r = ActionRow.parse(row);
    actions[r.action] = r.n;
  }
  return {
    reviewedDocuments: DocumentsRow.parse(docRows.rows[0]).n,
    actions,
    fields: fieldRows.rows.map((row) => {
      const r = FieldRow.parse(row);
      return {
        fieldPath: r.field_path,
        corrections: r.corrections,
        documents: r.documents,
        filledEmpty: r.filled_empty,
        changed: r.changed,
        cleared: r.cleared,
      };
    }),
  };
}

/** Markdown để in ra terminal hoặc dán vào PR. Hàm thuần: thời điểm do caller đưa vào. */
export function formatCorrectionsReport(
  report: CorrectionsReport,
  generatedAt: string,
): string {
  const { actions } = report;
  const lines = [
    "# Trường hay bị sửa nhất",
    "",
    `Tạo lúc: ${generatedAt}`,
    `Giấy đã duyệt: ${String(report.reviewedDocuments)}`,
    `Hành động: approve ${String(actions.approve)} · reject ${String(actions.reject)} · request_reupload ${String(actions.request_reupload)}`,
    "",
  ];
  if (report.fields.length === 0) {
    lines.push("Chưa có chỗ sửa nào.");
    return lines.join("\n") + "\n";
  }
  lines.push(
    "| Trường | Lần sửa | Giấy bị sửa | % giấy đã duyệt | AI để trống → điền | Đổi giá trị | Xoá giá trị |",
    "| --- | --- | --- | --- | --- | --- | --- |",
  );
  for (const f of report.fields) {
    const pct =
      report.reviewedDocuments === 0
        ? 0
        : (f.documents / report.reviewedDocuments) * 100;
    lines.push(
      `| ${f.fieldPath} | ${String(f.corrections)} | ${String(f.documents)} | ${pct.toFixed(1)}% | ${String(f.filledEmpty)} | ${String(f.changed)} | ${String(f.cleared)} |`,
    );
  }
  return lines.join("\n") + "\n";
}

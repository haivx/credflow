import { type Correction, Extraction } from "@credflow/contracts";
import type * as z from "zod";

/** Một lỗi của một correction; `index` là vị trí trong mảng client gửi. */
export interface CorrectionIssue {
  index: number;
  message: string;
}

/** Correction không áp được. Controller đổi thành 400 VALIDATION_FAILED, kèm `issues`. */
export class CorrectionError extends Error {
  constructor(readonly issues: CorrectionIssue[]) {
    super("Correction không hợp lệ");
    this.name = "CorrectionError";
  }
}

const FIELD_PATH = /^fields\.([A-Za-z]+)\.value$/;

/** Schema của từng trường (value + confidence + evidence) theo đúng loại giấy, lấy từ contract. */
function fieldSchemasOf(
  docType: Extraction["docType"],
): Map<string, z.ZodType> {
  const option = Extraction.options.find(
    (o) => o.shape.docType.value === docType,
  );
  if (option === undefined) throw new Error(`Không có schema cho ${docType}`);
  return new Map(Object.entries<z.ZodType>(option.shape.fields.shape));
}

/**
 * Áp chỗ sửa của người duyệt lên extraction gốc. Hàm thuần: không đổi `extraction` truyền vào.
 *
 * - `fieldPath` phải là `fields.<tên>.value` của đúng loại giấy.
 * - `before` phải khớp giá trị gốc: dữ liệu "trường hay bị sửa" (plan 29) không được sai vì client
 *   gửi nhầm. Trả lại corrections với `before` lấy từ extraction gốc.
 * - `after` parse bằng schema của trường (ngày phải `YYYY-MM-DD`), và phải khác `before`.
 * - Trường đã sửa có `confidence = 1` (người đã xác nhận), **giữ nguyên evidence gốc**: không bịa
 *   đoạn chữ gốc, nên trường không có evidence vẫn trượt `MISSING_EVIDENCE`.
 */
export function applyCorrections(
  extraction: Extraction | undefined,
  corrections: readonly Correction[],
): { extraction: Extraction | undefined; corrections: Correction[] } {
  if (corrections.length === 0) return { extraction, corrections: [] };
  if (extraction === undefined) {
    throw new CorrectionError([
      { index: 0, message: "Giấy chưa có kết quả trích xuất để sửa" },
    ]);
  }

  const fieldSchemas = fieldSchemasOf(extraction.docType);
  // Mọi `value` trong contract là chuỗi hoặc null (text, ngày ISO, enum).
  const fields = { ...extraction.fields } as Record<
    string,
    { value: string | null; confidence: number; evidence: unknown }
  >;
  const issues: CorrectionIssue[] = [];
  const seen = new Set<string>();
  const applied: Correction[] = [];

  corrections.forEach((c, index) => {
    const name = FIELD_PATH.exec(c.fieldPath)?.[1];
    const fieldSchema = name === undefined ? undefined : fieldSchemas.get(name);
    if (name === undefined || fieldSchema === undefined) {
      issues.push({ index, message: `Không có trường ${c.fieldPath}` });
      return;
    }
    if (seen.has(name)) {
      issues.push({ index, message: `Sửa ${c.fieldPath} hai lần` });
      return;
    }
    seen.add(name);

    const original = fields[name];
    const before = original?.value ?? null;
    if (before !== c.before) {
      issues.push({ index, message: `before không khớp giá trị gốc` });
      return;
    }
    if (c.after === c.before) {
      issues.push({ index, message: `after giống before, không có gì để sửa` });
      return;
    }
    const next = {
      value: c.after,
      confidence: 1,
      evidence: original?.evidence ?? null,
    };
    const parsed = fieldSchema.safeParse(next);
    if (!parsed.success) {
      issues.push({
        index,
        message: `after không hợp lệ cho ${name}`,
      });
      return;
    }
    fields[name] = next;
    applied.push({ fieldPath: c.fieldPath, before, after: c.after });
  });

  if (issues.length > 0) throw new CorrectionError(issues);
  // Parse lại cả extraction: kết quả sau khi sửa vẫn phải đúng contract.
  return {
    extraction: Extraction.parse({ docType: extraction.docType, fields }),
    corrections: applied,
  };
}

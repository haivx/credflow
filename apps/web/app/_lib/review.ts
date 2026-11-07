import {
  type Correction,
  Extraction,
  IsoDate,
  ReviewQueueSort,
  RuleCode,
  type RuleResult,
} from "@credflow/contracts";

// Hàm thuần cho màn duyệt (plan 28). Không gọi API, không đụng DOM: test bằng vitest.

export type FieldKind = "date" | "enum" | "text";

export interface EditableField {
  name: string;
  kind: FieldKind;
  /** Chỉ có với `enum`: giá trị hợp lệ, lấy từ contract. */
  options?: string[];
  value: string | null;
  confidence: number;
  quote: string | null;
}

/** Hình dạng tối thiểu của schema một trường (`extractedField` trong contracts). */
interface FieldSchema {
  shape: { value: { unwrap(): unknown } };
}

function kindOf(inner: unknown): { kind: FieldKind; options?: string[] } {
  if (inner === IsoDate) return { kind: "date" };
  if (
    typeof inner === "object" &&
    inner !== null &&
    "options" in inner &&
    Array.isArray(inner.options)
  ) {
    return { kind: "enum", options: inner.options.map(String) };
  }
  return { kind: "text" };
}

/**
 * Các trường sửa được của một extraction, đúng thứ tự trong contract. Kiểu ô (ngày / chọn / chữ) lấy
 * từ schema, nên thêm loại giấy ở P5 không phải sửa màn duyệt.
 */
export function editableFields(extraction: Extraction): EditableField[] {
  const option = Extraction.options.find(
    (o) => o.shape.docType.value === extraction.docType,
  );
  if (option === undefined) return [];
  const schemas = option.shape.fields.shape as unknown as Record<
    string,
    FieldSchema
  >;
  const values = extraction.fields as Record<
    string,
    {
      value: string | null;
      confidence: number;
      evidence: { quote: string } | null;
    }
  >;
  return Object.entries(schemas).map(([name, schema]) => {
    const field = values[name];
    return {
      name,
      ...kindOf(schema.shape.value.unwrap()),
      value: field?.value ?? null,
      confidence: field?.confidence ?? 0,
      quote: field?.evidence?.quote ?? null,
    };
  });
}

export const fieldPath = (name: string) => `fields.${name}.value`;

/**
 * Chỗ sửa gửi lên API từ chữ đang có trong các ô. Chỉ trường thật sự đổi; ô để trống = null;
 * `before` là giá trị gốc của extraction (server kiểm lại). Khoảng trắng hai đầu bỏ đi.
 */
export function buildCorrections(
  extraction: Extraction,
  edits: Readonly<Record<string, string>>,
): Correction[] {
  return editableFields(extraction).flatMap((field) => {
    const raw = edits[field.name];
    if (raw === undefined) return [];
    const trimmed = raw.trim();
    const after = trimmed === "" ? null : trimmed;
    if (after === field.value) return [];
    return [{ fieldPath: fieldPath(field.name), before: field.value, after }];
  });
}

export interface QueueFilter {
  reason?: RuleCode;
  sort: ReviewQueueSort;
}

/** Bộ lọc → query string (bỏ giá trị mặc định). Dùng cho URL trang và gọi API. */
export function queueParams(filter: QueueFilter): string {
  const params = new URLSearchParams();
  if (filter.reason !== undefined) params.set("reason", filter.reason);
  if (filter.sort !== "due") params.set("sort", filter.sort);
  return params.toString();
}

/** Đọc bộ lọc từ URL. Giá trị lạ thì bỏ qua (về mặc định), không làm hỏng trang. */
export function parseQueueFilter(params: {
  get(key: string): string | null;
}): QueueFilter {
  const reason = RuleCode.safeParse(params.get("reason"));
  const sort = ReviewQueueSort.safeParse(params.get("sort"));
  return {
    ...(reason.success ? { reason: reason.data } : {}),
    sort: sort.success ? sort.data : "due",
  };
}

/** Rule không qua (cả `info`), `block` trước. */
export function failedRules(results: readonly RuleResult[]): RuleResult[] {
  return results
    .filter((r) => !r.passed)
    .sort(
      (a, b) => Number(b.severity === "block") - Number(a.severity === "block"),
    );
}

/** Tên trường bị rule không qua nhắc tới: màn duyệt tô đỏ các ô này. */
export function failedFieldRefs(results: readonly RuleResult[]): Set<string> {
  return new Set(failedRules(results).flatMap((r) => r.fieldRefs));
}

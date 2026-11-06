import type {
  Classification,
  DocType,
  Extraction,
  RuleCode,
  RulesConfig,
  StaffProfile,
} from "@credflow/contracts";
import { quoteDateProblem } from "./date-quote.js";
import { addDays, addMonths, daysBetween, isRealDate } from "./dates.js";
import { issuerMatches, nameMatches } from "./names.js";

export type CprFields = Extract<Extraction, { docType: "cpr_card" }>["fields"];
type FieldName = keyof CprFields;
type Field = CprFields[FieldName];

export interface Check {
  passed: boolean;
  /** Câu cho người duyệt. Chỉ nêu tên trường, không chép giá trị trên giấy (data policy). */
  message: string;
  fieldRefs: string[];
}

export interface CprInput {
  fields: CprFields;
  classification: Classification;
  declaredDocType?: DocType | undefined;
  staff: StaffProfile;
  config: RulesConfig;
  asOf: string;
}

const REQUIRED: readonly FieldName[] = [
  "holderName",
  "issuerName",
  "courseType",
  "completionDate",
];
/** Tuỳ chọn, nhưng khi có giá trị thì quyết định EXPIRED nên phải đủ tin cậy. */
const EXPIRY_FIELDS: readonly FieldName[] = ["expirationDate", "validityText"];
const ALL_FIELDS: readonly FieldName[] = [
  ...REQUIRED,
  ...EXPIRY_FIELDS,
  "cardNumber",
];

/** Lệch tối đa giữa hạn in sẵn và hạn tính từ hiệu lực (doc-types.md). */
const MAX_EXPIRY_DRIFT_DAYS = 31;
/** Hạn xa hơn mức này so với ngày học là vô lý (ADR 0009). */
const MAX_VALIDITY_MONTHS = 120;

const WORD_NUMBERS: Readonly<Record<string, number>> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
};
// Lookbehind để "12-24 months" không bị đọc thành "24 months".
const VALIDITY =
  /(?<![\d-])\b(\d+|one|two|three|four|five)[\s-]*(years?|yrs?|months?|mos?)\b/gi;

function hasValue(field: Field): field is Field & { value: string } {
  return field.value !== null && field.value.trim() !== "";
}

/** Có đúng một khoảng thời gian mới nhận. Không đoán. */
function parseValidityMonths(text: string): number | undefined {
  const matches = [...text.matchAll(VALIDITY)];
  if (matches.length !== 1) return undefined;
  const [, amount = "", unit = ""] = matches[0] ?? [];
  const count = WORD_NUMBERS[amount.toLowerCase()] ?? Number(amount);
  if (count <= 0) return undefined;
  return unit.toLowerCase().startsWith("y") ? count * 12 : count;
}

/** `value` null mà có `evidence`: có chữ trên giấy nhưng không đọc được (prompt extract-cpr). */
function isUnreadable(field: Field): boolean {
  return !hasValue(field) && field.evidence !== null;
}

/**
 * Hạn hiệu lực theo thứ tự trong doc-types.md, `undefined` khi không xác định được.
 * Có chữ trên giấy mà không đọc được thì không rơi xuống bước sau, kẻo dùng hiệu lực mặc định
 * cho một thẻ có in hạn khác.
 */
function resolveExpiry(fields: CprFields, config: RulesConfig) {
  const { expirationDate, validityText, completionDate } = fields;
  if (hasValue(expirationDate)) {
    return isRealDate(expirationDate.value) ? expirationDate.value : undefined;
  }
  if (isUnreadable(expirationDate) || isUnreadable(validityText)) {
    return undefined;
  }
  if (!hasValue(completionDate) || !isRealDate(completionDate.value)) {
    return undefined;
  }
  const months = hasValue(validityText)
    ? parseValidityMonths(validityText.value)
    : config.defaultValidityMonths.cpr_card;
  return months === undefined
    ? undefined
    : addMonths(completionDate.value, months);
}

/**
 * Chữ gốc của ngày học/ngày hết hạn có cho biết chắc ngày không (plan 21). LLM có thể đã điền một
 * ngày cụ thể; không tin ngày đó. Message chỉ nêu tên trường, không chép giá trị.
 */
function dateQuoteProblem(fields: CprFields): string | undefined {
  for (const name of ["completionDate", "expirationDate"] as const) {
    const field = fields[name];
    if (!hasValue(field) || field.evidence === null) continue;
    const problem = quoteDateProblem(field.evidence.quote);
    if (problem === "ambiguous_order") {
      return `Ngày ${name} trong chữ gốc có thể đọc hai cách (tháng/ngày hoặc ngày/tháng)`;
    }
    if (problem === "no_day") {
      return `Ngày ${name} trong chữ gốc chỉ có tháng và năm, ngày cụ thể là suy đoán`;
    }
  }
  return undefined;
}

function dateProblem(fields: CprFields, asOf: string): string | undefined {
  const { completionDate, expirationDate, validityText } = fields;
  const completion = hasValue(completionDate)
    ? completionDate.value
    : undefined;
  const expiration = hasValue(expirationDate)
    ? expirationDate.value
    : undefined;

  if (completion !== undefined && !isRealDate(completion)) {
    return "Ngày học không có thật trên lịch";
  }
  if (expiration !== undefined && !isRealDate(expiration)) {
    return "Ngày hết hạn không có thật trên lịch";
  }
  const quoteProblem = dateQuoteProblem(fields);
  if (quoteProblem !== undefined) return quoteProblem;
  if (completion !== undefined && completion > asOf) {
    return "Ngày học nằm trong tương lai";
  }
  if (expiration === undefined && isUnreadable(expirationDate)) {
    return "Có in ngày hết hạn nhưng không đọc được";
  }
  if (expiration === undefined && isUnreadable(validityText)) {
    return "Có ghi hiệu lực nhưng không đọc được";
  }

  const months = hasValue(validityText)
    ? parseValidityMonths(validityText.value)
    : undefined;
  if (
    expiration === undefined &&
    hasValue(validityText) &&
    months === undefined
  ) {
    return "Có ghi hiệu lực nhưng không đọc được";
  }
  if (completion === undefined || expiration === undefined) return undefined;

  if (expiration < completion) return "Ngày hết hạn trước ngày học";
  if (expiration > addMonths(completion, MAX_VALIDITY_MONTHS)) {
    return "Ngày hết hạn quá xa so với ngày học";
  }
  if (
    months !== undefined &&
    Math.abs(daysBetween(addMonths(completion, months), expiration)) >
      MAX_EXPIRY_DRIFT_DAYS
  ) {
    return "Ngày hết hạn lệch với hiệu lực ghi trên giấy";
  }
  return undefined;
}

/** Luôn chấm đủ mọi rule: thiếu dữ liệu tính là không qua, không bao giờ là bỏ qua. */
export function evaluateCpr(input: CprInput): Partial<Record<RuleCode, Check>> {
  const { fields, classification, declaredDocType, staff, config, asOf } =
    input;
  const min = config.minFieldConfidence;
  const expiry = resolveExpiry(fields, config);
  const problem = dateProblem(fields, asOf);

  const missing = REQUIRED.filter((name) => !hasValue(fields[name]));
  const noEvidence = ALL_FIELDS.filter((name) => {
    const field = fields[name];
    if (!hasValue(field)) return false;
    return field.evidence === null || field.evidence.quote.trim() === "";
  });
  const lowFields = [...REQUIRED, ...EXPIRY_FIELDS].filter((name) => {
    const field = fields[name];
    return hasValue(field) && field.confidence < min;
  });
  const lowConfidence = [
    ...(classification.confidence < min ? ["docType"] : []),
    ...lowFields,
  ];

  const wrongType =
    classification.docType !== "cpr_card" ||
    (declaredDocType !== undefined && declaredDocType !== "cpr_card");
  const holder = fields.holderName;
  const issuer = fields.issuerName;
  const accepted = config.acceptedIssuers.cpr_card ?? [];
  const nameOk =
    hasValue(holder) &&
    nameMatches(holder.value, [staff.legalName, ...staff.aliases]);
  const issuerOk = hasValue(issuer) && issuerMatches(issuer.value, accepted);
  const expiringSoon =
    expiry !== undefined &&
    expiry >= asOf &&
    expiry <= addDays(asOf, config.expiringSoonDays);

  return {
    WRONG_DOC_TYPE: {
      passed: !wrongType,
      message: wrongType
        ? "Loại giấy phân loại được khác loại đã khai hoặc đã trích xuất"
        : "Đúng loại giấy",
      fieldRefs: ["docType"],
    },
    MISSING_FIELD: {
      passed: missing.length === 0,
      message:
        missing.length === 0
          ? "Đủ các trường bắt buộc"
          : "Thiếu trường bắt buộc",
      fieldRefs: [...missing],
    },
    MISSING_EVIDENCE: {
      passed: noEvidence.length === 0,
      message:
        noEvidence.length === 0
          ? "Mọi giá trị đều có bằng chứng"
          : "Có giá trị không có đoạn chữ gốc làm bằng chứng",
      fieldRefs: [...noEvidence],
    },
    LOW_CONFIDENCE: {
      passed: lowConfidence.length === 0,
      message:
        lowConfidence.length === 0
          ? "Độ tự tin đạt ngưỡng"
          : "Có trường dưới ngưỡng độ tự tin",
      fieldRefs: lowConfidence,
    },
    DATE_INCONSISTENT: {
      passed: problem === undefined,
      message: problem ?? "Ngày tháng nhất quán",
      fieldRefs: ["completionDate", "expirationDate", "validityText"],
    },
    NAME_MISMATCH: {
      passed: nameOk,
      message: nameOk
        ? "Tên khớp hồ sơ nhân viên"
        : "Tên trên giấy không khớp hồ sơ nhân viên",
      fieldRefs: ["holderName"],
    },
    EXPIRED: {
      passed: expiry !== undefined && expiry >= asOf,
      message:
        expiry === undefined
          ? "Không xác định được hạn hiệu lực"
          : expiry >= asOf
            ? "Còn hạn"
            : "Đã hết hạn",
      fieldRefs: ["expirationDate", "validityText", "completionDate"],
    },
    EXPIRING_SOON: {
      passed: !expiringSoon,
      message: expiringSoon ? "Sắp hết hạn" : "Chưa tới kỳ cảnh báo hết hạn",
      fieldRefs: ["expirationDate"],
    },
    ISSUER_NOT_ACCEPTED: {
      passed: issuerOk,
      message: issuerOk
        ? "Tổ chức cấp được chấp nhận"
        : "Tổ chức cấp không có trong danh sách của khách hàng",
      fieldRefs: ["issuerName"],
    },
  };
}

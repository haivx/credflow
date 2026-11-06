// Đọc lại chữ gốc (`evidence.quote`) của trường ngày để biết ngày có xác định chắc không (plan 21).
// LLM hay tự điền một ngày cụ thể cho chữ mơ hồ và chấm confidence cho lần đoán đó; code không tin
// ngày đó mà tự xét chữ in. Hàm thuần, chỉ dùng regex.

const MONTH =
  "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";

/** `a/b/yyyy`, `a-b-yy`, `a.b.yyyy`; không dính chữ số hay dấu ngày ở hai đầu (loại ISO, mã thẻ). */
const NUMERIC_DATE =
  /(?<![\d/.-])(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})(?![\d/.-])/g;
const ISO_DATE = /\b\d{4}-\d{2}-\d{2}\b/;
/**
 * "March 14, 2026", "Aug. 19, 2027", "14 March 2026", và dạng thứ tự kiểu văn bản (plan 24):
 * "14th day of March 2026", "the 14th of March, 2028". Số ngày phải đứng ngay trước "of <tháng>".
 */
const NAMED_DATE = new RegExp(
  `\\b(?:(?:${MONTH})\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?,?\\s+\\d{4}|\\d{1,2}(?:st|nd|rd|th)?\\s+(?:${MONTH})\\.?,?\\s+\\d{4}|\\d{1,2}(?:st|nd|rd|th)?\\s+(?:day\\s+)?of\\s+(?:${MONTH})\\.?,?\\s+\\d{4})\\b`,
  "i",
);
/** Chỉ tháng/năm: "12/2027", "03/2028". */
const NUMERIC_MONTH_YEAR = /(?<![\d/.-])(\d{1,2})[/.-](\d{4})(?![\d/.-])/g;
/** Chỉ tháng/năm bằng chữ: "March 2028", "Sept. 2027". */
const NAMED_MONTH_YEAR = new RegExp(`\\b(?:${MONTH})\\.?,?\\s+\\d{4}\\b`, "i");

export type QuoteDateProblem = "ambiguous_order" | "no_day";

/**
 * Lý do chữ gốc không đủ để biết chắc ngày; `undefined` là rõ ràng (hoặc không có ngày nào).
 * - `ambiguous_order`: có ngày số mà ngày và tháng đều ≤ 12 và khác nhau (`10/9/2025`).
 * - `no_day`: không có ngày đầy đủ nào, chỉ có tháng/năm (`Valid through 12/2027`).
 */
export function quoteDateProblem(quote: string): QuoteDateProblem | undefined {
  const numeric = [...quote.matchAll(NUMERIC_DATE)];
  const ambiguous = numeric.some((m) => {
    const a = Number(m[1]);
    const b = Number(m[2]);
    return a <= 12 && b <= 12 && a !== b;
  });
  if (ambiguous) return "ambiguous_order";

  const hasFullDate =
    numeric.length > 0 || ISO_DATE.test(quote) || NAMED_DATE.test(quote);
  if (hasFullDate) return undefined;

  const monthYear = [...quote.matchAll(NUMERIC_MONTH_YEAR)].some((m) => {
    const month = Number(m[1]);
    return month >= 1 && month <= 12;
  });
  if (monthYear || NAMED_MONTH_YEAR.test(quote)) return "no_day";
  return undefined;
}

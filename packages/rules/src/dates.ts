// Ngày lịch là chuỗi YYYY-MM-DD (A5). Tự tính trên số nguyên để không dính múi giờ của `Date`.

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

interface Parts {
  year: number;
  month: number;
  day: number;
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function parse(date: string): Parts | undefined {
  const match = ISO_DATE.exec(date);
  if (match === null) return undefined;
  const parts = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
  if (parts.month < 1 || parts.month > 12) return undefined;
  if (parts.day < 1 || parts.day > daysInMonth(parts.year, parts.month)) {
    return undefined;
  }
  return parts;
}

function mustParse(date: string): Parts {
  const parts = parse(date);
  if (parts === undefined) throw new Error("Ngày không hợp lệ");
  return parts;
}

function format({ year, month, day }: Parts): string {
  const pad = (value: number, width: number) =>
    String(value).padStart(width, "0");
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
}

/** Số ngày kể từ 1970-01-01 (thuật toán days_from_civil của Howard Hinnant). */
function toDayNumber({ year, month, day }: Parts): number {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yearOfEra = y - era * 400;
  const shiftedMonth = (month + 9) % 12; // tháng 3 = 0, để ngày nhuận nằm cuối "năm"
  const dayOfYear = Math.floor((153 * shiftedMonth + 2) / 5) + day - 1;
  const dayOfEra =
    yearOfEra * 365 +
    Math.floor(yearOfEra / 4) -
    Math.floor(yearOfEra / 100) +
    dayOfYear;
  return era * 146097 + dayOfEra - 719468;
}

function fromDayNumber(dayNumber: number): Parts {
  const z = dayNumber + 719468;
  const era = Math.floor(z / 146097);
  const dayOfEra = z - era * 146097;
  const yearOfEra = Math.floor(
    (dayOfEra -
      Math.floor(dayOfEra / 1460) +
      Math.floor(dayOfEra / 36524) -
      Math.floor(dayOfEra / 146096)) /
      365,
  );
  const dayOfYear =
    dayOfEra -
    (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100));
  const shiftedMonth = Math.floor((5 * dayOfYear + 2) / 153);
  const day = dayOfYear - Math.floor((153 * shiftedMonth + 2) / 5) + 1;
  const month = shiftedMonth < 10 ? shiftedMonth + 3 : shiftedMonth - 9;
  const year = yearOfEra + era * 400 + (month <= 2 ? 1 : 0);
  return { year, month, day };
}

/** Đúng dạng và có thật trên lịch. Regex của `IsoDate` vẫn cho `2026-02-30` đi qua. */
export function isRealDate(date: string): boolean {
  return parse(date) !== undefined;
}

/** Cộng tháng, kẹp về cuối tháng: 2024-02-29 + 12 tháng = 2025-02-28. */
export function addMonths(date: string, months: number): string {
  const { year, month, day } = mustParse(date);
  const total = year * 12 + (month - 1) + months;
  const newYear = Math.floor(total / 12);
  const newMonth = total - newYear * 12 + 1;
  return format({
    year: newYear,
    month: newMonth,
    day: Math.min(day, daysInMonth(newYear, newMonth)),
  });
}

export function addDays(date: string, days: number): string {
  return format(fromDayNumber(toDayNumber(mustParse(date)) + days));
}

/** Số ngày từ `from` tới `to`; âm khi `to` đứng trước. */
export function daysBetween(from: string, to: string): number {
  return toDayNumber(mustParse(to)) - toDayNumber(mustParse(from));
}

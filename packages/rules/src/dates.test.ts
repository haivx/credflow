import { describe, expect, it } from "vitest";
import { addDays, addMonths, daysBetween, isRealDate } from "./dates.js";

describe("isRealDate", () => {
  it.each([
    ["2026-03-14", true],
    ["2024-02-29", true],
    ["2000-02-29", true],
    ["2023-02-29", false],
    ["1900-02-29", false],
    ["2026-02-30", false],
    ["2026-13-01", false],
    ["2026-00-10", false],
    ["2026-01-00", false],
    ["2026-1-1", false],
    ["03/14/2026", false],
    ["", false],
  ])("%s → %s", (date, expected) => {
    expect(isRealDate(date)).toBe(expected);
  });
});

describe("addMonths", () => {
  it.each([
    ["2026-03-14", 24, "2028-03-14"],
    ["2024-02-29", 12, "2025-02-28"],
    ["2024-02-29", 48, "2028-02-29"],
    ["2023-01-31", 1, "2023-02-28"],
    ["2024-01-31", 1, "2024-02-29"],
    ["2026-12-15", 1, "2027-01-15"],
    ["2026-11-30", 3, "2027-02-28"],
  ])("%s + %i tháng = %s", (date, months, expected) => {
    expect(addMonths(date, months)).toBe(expected);
  });
});

describe("addDays", () => {
  it.each([
    ["2024-02-28", 1, "2024-02-29"],
    ["2023-02-28", 1, "2023-03-01"],
    ["2023-12-31", 1, "2024-01-01"],
    ["2026-11-05", 30, "2026-12-05"],
    ["2026-03-01", 0, "2026-03-01"],
  ])("%s + %i ngày = %s", (date, days, expected) => {
    expect(addDays(date, days)).toBe(expected);
  });
});

describe("daysBetween", () => {
  it.each([
    ["2024-02-28", "2024-03-01", 2],
    ["2023-02-28", "2023-03-01", 1],
    ["2026-01-01", "2026-01-01", 0],
    ["2026-03-01", "2026-01-30", -30],
    ["2024-01-01", "2025-01-01", 366],
  ])("%s tới %s = %i", (from, to, expected) => {
    expect(daysBetween(from, to)).toBe(expected);
  });
});

import { describe, expect, it } from "vitest";
import { quoteDateProblem } from "./date-quote.js";

describe("quoteDateProblem", () => {
  it.each([
    "10/9/2025",
    "7/8/2026",
    "Completed 10.9.2025",
    "10-9-25",
    "Class Completion Date 3/9/2026",
  ])("ngày và tháng đều ≤ 12, khác nhau: %s → ambiguous_order", (quote) => {
    expect(quoteDateProblem(quote)).toBe("ambiguous_order");
  });

  it.each([
    "5/28/2028",
    "3/14/2026 Class Completion Date",
    "28/5/2028",
    "5/5/2026",
    "2026-01-18",
    "Issued 2026-03-14",
    "March 14, 2026",
    "14 March 2026",
    "Aug. 19, 2027",
    "Valid Through August 19, 2027",
    "Valid 2 years from the date of completion.",
    "",
    "5/28/2028 (renew by 05/2028)",
  ])("rõ ràng hoặc không có ngày: %s → undefined", (quote) => {
    expect(quoteDateProblem(quote)).toBeUndefined();
  });

  it.each([
    "Valid through 12/2027",
    "Recommended renewal: 03/2028",
    "March 2028",
    "Valid through Mar 2028",
    "Renew by Sept. 2027",
  ])("chỉ có tháng/năm: %s → no_day", (quote) => {
    expect(quoteDateProblem(quote)).toBe("no_day");
  });

  it("có cả ngày mơ hồ và tháng/năm: ưu tiên báo thứ tự mơ hồ", () => {
    expect(quoteDateProblem("10/9/2025, renew 10/2027")).toBe(
      "ambiguous_order",
    );
  });

  it("số không phải ngày (mã thẻ, năm đơn lẻ) không bị hiểu nhầm", () => {
    expect(quoteDateProblem("Card NSC-448120")).toBeUndefined();
    expect(quoteDateProblem("Since 2019")).toBeUndefined();
    expect(quoteDateProblem("Code 7Q2-KX-9184")).toBeUndefined();
  });

  // Plan 24: ngày dạng thứ tự kiểu văn bản là ngày đầy đủ.
  it.each([
    "on this 14th day of March 2026.",
    "This certification is valid until the 14th day of March, 2028.",
    "the 14th of March, 2028",
    "1st day of May 2027",
    "the 3rd day of Sept. 2027",
    "22nd day of October 2026",
  ])("ngày dạng thứ tự: %s → undefined", (quote) => {
    expect(quoteDateProblem(quote)).toBeUndefined();
  });

  it.each([
    "valid through the month of March 2028",
    "the 14th day of the month following completion, March 2028",
  ])('không có số ngày ngay trước "of <tháng>": %s → no_day', (quote) => {
    expect(quoteDateProblem(quote)).toBe("no_day");
  });

  it("thứ tự D/M mơ hồ vẫn ưu tiên dù có ngày dạng thứ tự", () => {
    expect(quoteDateProblem("10/9/2025 or the 14th day of March 2026")).toBe(
      "ambiguous_order",
    );
  });
});

describe("quoteDateProblem với dateOrder (plan 25)", () => {
  it.each([
    ["3/9/2026", "MDY", "2026-03-09", undefined],
    ["3/9/2026", "MDY", "2026-09-03", "order_mismatch"],
    ["3/9/2026", "DMY", "2026-09-03", undefined],
    ["3/9/2026", "DMY", "2026-03-09", "order_mismatch"],
    ["3/9/2026", "strict", "2026-03-09", "ambiguous_order"],
    ["Completed 3/9/26", "MDY", "2026-03-09", undefined],
    ["Valid through 12/2027", "MDY", "2027-12-31", "no_day"],
    ["March 14, 2026", "MDY", "2026-03-14", undefined],
  ] as const)("%s, %s, value %s → %s", (quote, order, value, expected) => {
    expect(quoteDateProblem(quote, order, value)).toBe(expected);
  });
});

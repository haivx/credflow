import type { Extraction } from "@credflow/contracts";
import { describe, expect, it } from "vitest";
import { compareFields, isFalseApprove } from "./compare.js";

const field = (value: string | null) => ({
  value,
  confidence: 0.95,
  evidence: value === null ? null : { quote: value },
});

const cpr = (
  overrides: Partial<Record<string, string | null>> = {},
): Extraction => ({
  docType: "cpr_card",
  fields: {
    holderName: field(overrides.holderName ?? "QUENNELL, MARISOL"),
    issuerName: field(overrides.issuerName ?? "LIFELINE RESPONSE INSTITUTE"),
    courseType: field("BLS Provider"),
    completionDate: field(overrides.completionDate ?? "2026-03-28"),
    expirationDate: field(
      "expirationDate" in overrides
        ? (overrides.expirationDate ?? null)
        : "2028-03-31",
    ),
    validityText: field(null),
    cardNumber: field(overrides.cardNumber ?? " 7Q2-KX-9184 "),
  },
});

describe("compareFields", () => {
  it("tên đảo họ, tổ chức viết hoa, mã thẻ có khoảng trắng: khớp", () => {
    const result = compareFields(
      {
        holderName: "Marisol Quennell",
        issuerName: "Lifeline Response Institute",
        expirationDate: "2028-03-31",
        cardNumber: "7Q2-KX-9184",
      },
      cpr(),
    );
    expect(result).toEqual({
      compared: ["holderName", "issuerName", "expirationDate", "cardNumber"],
      mismatches: [],
    });
  });

  it("ngày lệch một ngày: sai", () => {
    const result = compareFields({ expirationDate: "2028-03-30" }, cpr());
    expect(result.mismatches).toEqual(["expirationDate"]);
  });

  it("đáp án null mà LLM có giá trị: sai; cả hai null: khớp", () => {
    expect(compareFields({ cardNumber: null }, cpr()).mismatches).toEqual([
      "cardNumber",
    ]);
    expect(compareFields({ validityText: null }, cpr()).mismatches).toEqual([]);
  });

  it("đáp án có giá trị mà LLM để null: sai", () => {
    expect(
      compareFields(
        { expirationDate: "2028-03-31" },
        cpr({ expirationDate: null }),
      ).mismatches,
    ).toEqual(["expirationDate"]);
  });

  it("không có extraction: mọi trường có giá trị trong đáp án đều sai", () => {
    expect(
      compareFields(
        { holderName: "Marisol Quennell", validityText: null },
        undefined,
      ),
    ).toEqual({
      compared: ["holderName", "validityText"],
      mismatches: ["holderName"],
    });
  });

  it("trường không có trong loại giấy: sai", () => {
    expect(compareFields({ licenseNumber: "X-1" }, cpr()).mismatches).toEqual([
      "licenseNumber",
    ]);
  });
});

describe("isFalseApprove", () => {
  it("tự duyệt mà đáp án là needs_review", () => {
    expect(isFalseApprove("auto_approve", "needs_review", [])).toBe(true);
  });

  it("tự duyệt đúng đáp án nhưng đọc sai một trường", () => {
    expect(
      isFalseApprove("auto_approve", "auto_approve", ["expirationDate"]),
    ).toBe(true);
  });

  it("tự duyệt đúng, đọc đúng", () => {
    expect(isFalseApprove("auto_approve", "auto_approve", [])).toBe(false);
  });

  it("chuyển người duyệt thì không bao giờ là duyệt nhầm", () => {
    expect(isFalseApprove("needs_review", "auto_approve", ["holderName"])).toBe(
      false,
    );
    expect(isFalseApprove("needs_review", "needs_review", [])).toBe(false);
  });
});

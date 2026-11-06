import { describe, expect, it } from "vitest";
import type { Extraction } from "@credflow/contracts";
import { contractFixture } from "../../test/contract-fixtures.js";
import { applyCorrections, CorrectionError } from "./corrections.js";

const cpr = (): Extraction =>
  contractFixture("Extraction", "thẻ CPR in ngày hết hạn");

function fieldsOf(extraction: Extraction | undefined) {
  if (extraction?.docType !== "cpr_card") throw new Error("không phải CPR");
  return extraction.fields;
}

function issuesOf(fn: () => unknown): string[] {
  try {
    fn();
  } catch (err) {
    if (err instanceof CorrectionError) return err.issues.map((i) => i.message);
    throw err;
  }
  throw new Error("không ném CorrectionError");
}

describe("applyCorrections", () => {
  it("sửa ngày: value mới, confidence 1, giữ evidence gốc, không đổi extraction gốc", () => {
    const original = cpr();
    const { extraction, corrections } = applyCorrections(original, [
      {
        fieldPath: "fields.expirationDate.value",
        before: "2028-04-19",
        after: "2028-05-19",
      },
    ]);

    const field = fieldsOf(extraction).expirationDate;
    expect(field.value).toBe("2028-05-19");
    expect(field.confidence).toBe(1);
    expect(field.evidence).toEqual({ quote: "4/19/2028" });
    expect(fieldsOf(original).expirationDate.value).toBe("2028-04-19");
    expect(corrections).toEqual([
      {
        fieldPath: "fields.expirationDate.value",
        before: "2028-04-19",
        after: "2028-05-19",
      },
    ]);
  });

  it("điền trường trống: evidence vẫn null (không bịa chữ gốc)", () => {
    const { extraction } = applyCorrections(cpr(), [
      { fieldPath: "fields.cardNumber.value", before: null, after: "A-123" },
    ]);
    const field = fieldsOf(extraction).cardNumber;
    expect(field.value).toBe("A-123");
    expect(field.evidence).toBeNull();
  });

  it("không có correction: trả nguyên extraction, kể cả khi chưa có extraction", () => {
    const original = cpr();
    expect(applyCorrections(original, []).extraction).toBe(original);
    expect(applyCorrections(undefined, []).extraction).toBeUndefined();
  });

  it.each([
    [
      "trường không có",
      { fieldPath: "fields.khongCo.value", before: null, after: "x" },
    ],
    [
      "path sai dạng",
      {
        fieldPath: "expirationDate",
        before: "2028-04-19",
        after: "2028-05-19",
      },
    ],
    [
      "ngày sai định dạng",
      {
        fieldPath: "fields.expirationDate.value",
        before: "2028-04-19",
        after: "09/02/2025",
      },
    ],
    [
      "before lệch giá trị gốc",
      {
        fieldPath: "fields.expirationDate.value",
        before: "2027-01-01",
        after: "2028-05-19",
      },
    ],
    [
      "after giống before",
      {
        fieldPath: "fields.holderName.value",
        before: "Jane Q. Doe",
        after: "Jane Q. Doe",
      },
    ],
  ])("%s → CorrectionError", (_name, correction) => {
    expect(issuesOf(() => applyCorrections(cpr(), [correction]))).toHaveLength(
      1,
    );
  });

  it("sửa một trường hai lần → lỗi", () => {
    const c = {
      fieldPath: "fields.holderName.value",
      before: "Jane Q. Doe",
      after: "Jane Doe",
    };
    expect(issuesOf(() => applyCorrections(cpr(), [c, c]))).toHaveLength(1);
  });

  it("có correction mà chưa có extraction → lỗi", () => {
    expect(
      issuesOf(() =>
        applyCorrections(undefined, [
          { fieldPath: "fields.holderName.value", before: null, after: "A" },
        ]),
      ),
    ).toHaveLength(1);
  });
});

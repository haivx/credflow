import { describe, expect, it } from "vitest";
import {
  type CorrectionsReport,
  formatCorrectionsReport,
} from "./corrections-report.js";

const AT = "2026-11-07T10:00:00.000Z";

const empty: CorrectionsReport = {
  reviewedDocuments: 0,
  actions: { approve: 0, reject: 0, request_reupload: 0 },
  fields: [],
};

describe("formatCorrectionsReport (plan 29)", () => {
  it("chưa có chỗ sửa nào thì nói rõ, vẫn in tổng", () => {
    const out = formatCorrectionsReport(empty, AT);
    expect(out).toContain("Chưa có chỗ sửa nào");
    expect(out).toContain("Giấy đã duyệt: 0");
    expect(out).not.toContain("| Trường |");
  });

  it("giữ thứ tự, % tính trên số giấy đã duyệt, làm tròn 1 chữ số", () => {
    const out = formatCorrectionsReport(
      {
        reviewedDocuments: 3,
        actions: { approve: 2, reject: 1, request_reupload: 0 },
        fields: [
          {
            fieldPath: "fields.expirationDate.value",
            corrections: 3,
            documents: 2,
            filledEmpty: 1,
            changed: 2,
            cleared: 0,
          },
          {
            fieldPath: "fields.holderName.value",
            corrections: 1,
            documents: 1,
            filledEmpty: 0,
            changed: 0,
            cleared: 1,
          },
        ],
      },
      AT,
    );
    const rows = out.split("\n").filter((l) => l.startsWith("| fields."));
    expect(rows).toEqual([
      "| fields.expirationDate.value | 3 | 2 | 66.7% | 1 | 2 | 0 |",
      "| fields.holderName.value | 1 | 1 | 33.3% | 0 | 0 | 1 |",
    ]);
    expect(out).toContain("approve 2 · reject 1 · request_reupload 0");
    expect(out).toContain(AT);
  });
});

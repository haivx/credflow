import { describe, expect, it } from "vitest";
import type { Extraction, RuleResult } from "@credflow/contracts";
import {
  buildCorrections,
  editableFields,
  failedFieldRefs,
  failedRules,
  parseQueueFilter,
  queueParams,
} from "./review";

const field = <T extends string>(
  value: T | null,
  quote: string | null = value,
) => ({
  value,
  confidence: 0.9,
  evidence: quote === null ? null : { quote },
});

const cpr: Extraction = {
  docType: "cpr_card",
  fields: {
    holderName: field("Avery Testwood"),
    issuerName: field("Lifeline Response Institute"),
    courseType: field("BLS Provider"),
    completionDate: field(null, "on 09/02/2025"),
    expirationDate: field("2027-09-02"),
    validityText: field(null),
    cardNumber: field(null),
  },
};

const tb: Extraction = {
  docType: "tb_test",
  fields: {
    holderName: field("Avery Testwood"),
    testType: field("skin_test"),
    testDate: field("2026-10-01"),
    readDate: field("2026-10-03"),
    result: field("negative"),
    clinicName: field("Northwind Clinic (SAMPLE)"),
  },
};

describe("editableFields", () => {
  it("CPR: đủ 7 trường theo thứ tự contract, ngày là date, giữ quote", () => {
    const fields = editableFields(cpr);
    expect(fields.map((f) => f.name)).toEqual([
      "holderName",
      "issuerName",
      "courseType",
      "completionDate",
      "expirationDate",
      "validityText",
      "cardNumber",
    ]);
    const completion = fields.find((f) => f.name === "completionDate");
    expect(completion).toMatchObject({
      kind: "date",
      value: null,
      quote: "on 09/02/2025",
    });
    expect(fields.find((f) => f.name === "holderName")?.kind).toBe("text");
  });

  it("TB: trường enum có option lấy từ contract", () => {
    const result = editableFields(tb).find((f) => f.name === "result");
    expect(result).toMatchObject({
      kind: "enum",
      options: ["negative", "positive", "indeterminate"],
    });
  });
});

describe("buildCorrections", () => {
  it("không đổi gì (kể cả gõ lại đúng giá trị, có khoảng trắng) → rỗng", () => {
    expect(buildCorrections(cpr, {})).toEqual([]);
    expect(buildCorrections(cpr, { holderName: "  Avery Testwood " })).toEqual(
      [],
    );
  });

  it("điền trường trống: before null, after đã trim", () => {
    expect(buildCorrections(cpr, { completionDate: " 2025-09-02 " })).toEqual([
      {
        fieldPath: "fields.completionDate.value",
        before: null,
        after: "2025-09-02",
      },
    ]);
  });

  it("xoá giá trị: ô trống → after null", () => {
    expect(buildCorrections(cpr, { expirationDate: "   " })).toEqual([
      {
        fieldPath: "fields.expirationDate.value",
        before: "2027-09-02",
        after: null,
      },
    ]);
  });

  it("ô trống trên trường vốn null → không phải chỗ sửa", () => {
    expect(buildCorrections(cpr, { cardNumber: "" })).toEqual([]);
  });

  it("trường lạ trong edits bị bỏ qua", () => {
    expect(buildCorrections(cpr, { khongCo: "x" })).toEqual([]);
  });
});

describe("queue filter", () => {
  it("bỏ giá trị mặc định; khứ hồi qua URL", () => {
    expect(queueParams({ sort: "due" })).toBe("");
    const qs = queueParams({ reason: "EXPIRED", sort: "submitted" });
    expect(qs).toBe("reason=EXPIRED&sort=submitted");
    expect(parseQueueFilter(new URLSearchParams(qs))).toEqual({
      reason: "EXPIRED",
      sort: "submitted",
    });
  });

  it("giá trị lạ trên URL → mặc định", () => {
    expect(
      parseQueueFilter(new URLSearchParams("reason=FOO&sort=random")),
    ).toEqual({ sort: "due" });
  });
});

describe("failed rules", () => {
  const rule = (
    code: RuleResult["code"],
    passed: boolean,
    severity: RuleResult["severity"],
    fieldRefs: string[],
  ): RuleResult => ({ code, passed, severity, message: code, fieldRefs });

  it("chỉ rule không qua, block trước info; gom fieldRefs", () => {
    const results = [
      rule("EXPIRING_SOON", false, "info", ["expirationDate"]),
      rule("NAME_MISMATCH", true, "block", ["holderName"]),
      rule("MISSING_FIELD", false, "block", ["completionDate"]),
    ];
    expect(failedRules(results).map((r) => r.code)).toEqual([
      "MISSING_FIELD",
      "EXPIRING_SOON",
    ]);
    expect(failedFieldRefs(results)).toEqual(
      new Set(["completionDate", "expirationDate"]),
    );
  });
});

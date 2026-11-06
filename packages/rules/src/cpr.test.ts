import { describe, expect, it } from "vitest";
import type {
  Classification,
  Extraction,
  RuleCode,
  RulesConfigInput,
  StaffProfile,
} from "@credflow/contracts";
import { evaluateRules, type RuleInput, route } from "./index.js";
import { RULES_BY_DOC_TYPE } from "./registry.js";

type Cpr = Extract<Extraction, { docType: "cpr_card" }>;
type Fields = Cpr["fields"];
type FieldName = keyof Fields;

const AS_OF = "2026-11-05";

const field = (value: string, confidence = 0.95) => ({
  value,
  confidence,
  evidence: { quote: value },
});
const empty = { value: null, confidence: 0, evidence: null };

const goodFields = (): Fields => ({
  holderName: field("Maren Ostrowe"),
  issuerName: field("Northbridge Safety Council"),
  courseType: field("Adult CPR"),
  completionDate: field("2026-03-14"),
  expirationDate: field("2028-03-14"),
  validityText: empty,
  cardNumber: field("NSC-1"),
});

const STAFF: StaffProfile = {
  id: "s1",
  legalName: "Maren Ostrowe",
  aliases: ["Maren Whitlock"],
  role: "caregiver",
  clientIds: [],
  region: "CA",
};

const CONFIG: RulesConfigInput = {
  version: 1,
  minFieldConfidence: 0.85,
  expiringSoonDays: 30,
  roles: { caregiver: { required: ["cpr_card"] } },
  defaultValidityMonths: { cpr_card: 24 },
  acceptedIssuers: { cpr_card: ["Northbridge Safety Council"] },
};

const CLASSIFIED: Classification = { docType: "cpr_card", confidence: 0.97 };

function run(
  patch: Partial<Fields> = {},
  input: Partial<Omit<RuleInput, "extraction">> = {},
) {
  return evaluateRules({
    extraction: { docType: "cpr_card", fields: { ...goodFields(), ...patch } },
    classification: CLASSIFIED,
    staff: STAFF,
    config: CONFIG,
    asOf: AS_OF,
    ...input,
  });
}

const failed = (results: ReturnType<typeof run>) =>
  results.filter((r) => !r.passed).map((r) => r.code);

const passes = (code: RuleCode, results: ReturnType<typeof run>) =>
  results.find((r) => r.code === code)?.passed;

describe("thẻ tốt", () => {
  it("mọi rule qua, route ra auto_approve", () => {
    const results = run();
    expect(failed(results)).toEqual([]);
    expect(route(results)).toEqual({ decision: "auto_approve", reasons: [] });
  });

  it("trả đúng tập rule trong registry, severity lấy từ registry", () => {
    expect(run().map((r) => [r.code, r.severity])).toEqual(
      RULES_BY_DOC_TYPE.cpr_card.map((d) => [d.code, d.severity]),
    );
  });

  it("thiếu dữ liệu vẫn trả đủ mọi rule, không rule nào bị bỏ qua", () => {
    const allEmpty: Fields = {
      holderName: empty,
      issuerName: empty,
      courseType: empty,
      completionDate: empty,
      expirationDate: empty,
      validityText: empty,
      cardNumber: empty,
    };
    expect(run(allEmpty).map((r) => r.code)).toEqual(
      RULES_BY_DOC_TYPE.cpr_card.map((d) => d.code),
    );
    expect(route(run(allEmpty)).decision).toBe("needs_review");
  });

  it("message không chép giá trị trên giấy", () => {
    const results = run({
      holderName: field("Tên Người Khác"),
      issuerName: field("Tổ Chức Khác"),
    });
    expect(JSON.stringify(results)).not.toContain("Tên Người Khác");
    expect(JSON.stringify(results)).not.toContain("Tổ Chức Khác");
  });
});

describe("WRONG_DOC_TYPE", () => {
  it("không khai loại thì qua", () => {
    expect(passes("WRONG_DOC_TYPE", run())).toBe(true);
  });

  it("khai đúng loại thì qua", () => {
    expect(
      passes("WRONG_DOC_TYPE", run({}, { declaredDocType: "cpr_card" })),
    ).toBe(true);
  });

  it("khai khác loại thì không qua", () => {
    expect(
      passes("WRONG_DOC_TYPE", run({}, { declaredDocType: "tb_test" })),
    ).toBe(false);
  });

  it("phân loại khác loại đã trích xuất thì không qua", () => {
    expect(
      passes(
        "WRONG_DOC_TYPE",
        run({}, { classification: { docType: "unknown", confidence: 0.9 } }),
      ),
    ).toBe(false);
  });
});

describe("MISSING_FIELD", () => {
  const required: FieldName[] = [
    "holderName",
    "issuerName",
    "courseType",
    "completionDate",
  ];

  it.each(required)("%s null thì không qua", (name) => {
    expect(passes("MISSING_FIELD", run({ [name]: empty }))).toBe(false);
  });

  it.each(required)("%s rỗng hoặc toàn khoảng trắng thì không qua", (name) => {
    for (const value of ["", "   "]) {
      const results = run({ [name]: { ...field("x"), value } });
      expect(passes("MISSING_FIELD", results)).toBe(false);
    }
  });

  it.each(["expirationDate", "validityText", "cardNumber"] as const)(
    "%s là tuỳ chọn",
    (name) => {
      expect(passes("MISSING_FIELD", run({ [name]: empty }))).toBe(true);
    },
  );
});

describe("MISSING_EVIDENCE", () => {
  it.each(Object.keys(goodFields()).filter((n) => n !== "validityText"))(
    "%s có value mà không có evidence thì không qua",
    (name) => {
      const results = run({ [name]: { ...field("x"), evidence: null } });
      expect(passes("MISSING_EVIDENCE", results)).toBe(false);
    },
  );

  it("quote toàn khoảng trắng thì không qua", () => {
    const results = run({
      cardNumber: { ...field("x"), evidence: { quote: "   " } },
    });
    expect(passes("MISSING_EVIDENCE", results)).toBe(false);
  });

  it("không có value thì không cần evidence", () => {
    expect(passes("MISSING_EVIDENCE", run({ cardNumber: empty }))).toBe(true);
  });
});

describe("LOW_CONFIDENCE", () => {
  const checked: FieldName[] = [
    "holderName",
    "issuerName",
    "courseType",
    "completionDate",
    "expirationDate",
  ];

  it.each(checked)("%s đúng ngưỡng thì qua, ngay dưới thì không", (name) => {
    const at = goodFields()[name];
    expect(
      passes("LOW_CONFIDENCE", run({ [name]: { ...at, confidence: 0.85 } })),
    ).toBe(true);
    expect(
      passes("LOW_CONFIDENCE", run({ [name]: { ...at, confidence: 0.84 } })),
    ).toBe(false);
  });

  it("validityText có giá trị cũng bị kiểm", () => {
    const results = run({
      expirationDate: empty,
      validityText: field("Valid 2 years", 0.5),
    });
    expect(passes("LOW_CONFIDENCE", results)).toBe(false);
  });

  it("cardNumber tuỳ chọn, không bị kiểm", () => {
    expect(passes("LOW_CONFIDENCE", run({ cardNumber: field("x", 0.1) }))).toBe(
      true,
    );
  });

  it("bước phân loại đúng ngưỡng thì qua", () => {
    const results = run(
      {},
      { classification: { docType: "cpr_card", confidence: 0.85 } },
    );
    expect(passes("LOW_CONFIDENCE", results)).toBe(true);
  });

  it("bước phân loại dưới ngưỡng thì không qua, fieldRefs là docType", () => {
    const results = run(
      {},
      { classification: { docType: "cpr_card", confidence: 0.84 } },
    );
    const rule = results.find((r) => r.code === "LOW_CONFIDENCE");
    expect(rule?.passed).toBe(false);
    expect(rule?.fieldRefs).toEqual(["docType"]);
  });
});

describe("DATE_INCONSISTENT", () => {
  const bad = (patch: Partial<Fields>) =>
    passes("DATE_INCONSISTENT", run(patch));

  // Plan 21: LLM điền ra ngày cụ thể, nhưng chữ in trên thẻ không cho biết chắc ngày.
  const quoted = (value: string, quote: string) => ({
    value,
    confidence: 0.85,
    evidence: { quote },
  });

  it("chữ gốc ngày hết hạn mơ hồ (D/M ≤ 12) hoặc chỉ tháng/năm: không qua, không tự duyệt", () => {
    for (const quote of ["10/9/2027", "Valid through 10/2027"]) {
      const results = run({ expirationDate: quoted("2027-10-09", quote) });
      expect(passes("DATE_INCONSISTENT", results), quote).toBe(false);
      expect(route(results).decision, quote).toBe("needs_review");
    }
  });

  it("chữ gốc ngày học mơ hồ: không qua", () => {
    expect(
      bad({ completionDate: quoted("2026-03-09", "Completed 3/9/2026") }),
    ).toBe(false);
  });

  it("chữ gốc rõ ràng thì qua như trước", () => {
    expect(
      bad({
        completionDate: quoted("2026-03-14", "3/14/2026"),
        expirationDate: quoted("2028-03-14", "March 14, 2028"),
      }),
    ).toBe(true);
  });

  it("message chỉ nêu tên trường, không chép ngày", () => {
    const results = run({ expirationDate: quoted("2027-10-09", "10/9/2027") });
    const rule = results.find((r) => r.code === "DATE_INCONSISTENT");
    expect(rule?.message).toContain("expirationDate");
    expect(JSON.stringify(results)).not.toContain("10/9/2027");
  });

  it("ngày không có thật thì không qua", () => {
    expect(bad({ completionDate: field("2026-02-30") })).toBe(false);
    expect(bad({ expirationDate: field("2027-02-30") })).toBe(false);
  });

  it("ngày học sau asOf thì không qua; đúng asOf thì qua", () => {
    expect(bad({ completionDate: field("2026-11-06") })).toBe(false);
    expect(bad({ completionDate: field(AS_OF) })).toBe(true);
  });

  it("hạn trước ngày học thì không qua; trùng ngày thì qua", () => {
    expect(bad({ expirationDate: field("2026-03-13") })).toBe(false);
    expect(bad({ expirationDate: field("2026-03-14") })).toBe(true);
  });

  it("hạn đúng 10 năm sau ngày học thì qua, hơn thì không", () => {
    expect(bad({ expirationDate: field("2036-03-14") })).toBe(true);
    expect(bad({ expirationDate: field("2036-03-15") })).toBe(false);
  });

  it("có cả hạn và hiệu lực: lệch 31 ngày thì qua, 32 ngày thì không", () => {
    const validity = { validityText: field("Valid 2 years") };
    expect(bad({ ...validity, expirationDate: field("2028-04-14") })).toBe(
      true,
    );
    expect(bad({ ...validity, expirationDate: field("2028-04-15") })).toBe(
      false,
    );
    expect(bad({ ...validity, expirationDate: field("2028-02-12") })).toBe(
      true,
    );
    expect(bad({ ...validity, expirationDate: field("2028-02-11") })).toBe(
      false,
    );
  });

  it.each([
    "See reverse side",
    "12-24 months",
    "1 year or 2 years",
    "Valid",
    "2",
  ])(
    "hiệu lực %s không đọc được, không có hạn: không qua, không rơi về mặc định",
    (text) => {
      const results = run({
        expirationDate: empty,
        validityText: field(text),
      });
      expect(passes("DATE_INCONSISTENT", results)).toBe(false);
      expect(passes("EXPIRED", results)).toBe(false);
    },
  );

  it("hiệu lực không đọc được nhưng có hạn in sẵn thì không mâu thuẫn", () => {
    expect(bad({ validityText: field("See reverse side") })).toBe(true);
  });

  it("hạn in trên giấy nhưng không đọc được: không qua, không rơi về mặc định", () => {
    const results = run({
      expirationDate: {
        value: null,
        confidence: 0,
        evidence: { quote: "09/02/2028" },
      },
    });
    expect(passes("DATE_INCONSISTENT", results)).toBe(false);
    expect(passes("EXPIRED", results)).toBe(false);
    expect(route(results).decision).toBe("needs_review");
  });

  it("hiệu lực in trên giấy nhưng không đọc được cũng vậy", () => {
    const results = run({
      expirationDate: empty,
      validityText: { value: null, confidence: 0, evidence: { quote: "2 y?" } },
    });
    expect(passes("DATE_INCONSISTENT", results)).toBe(false);
    expect(passes("EXPIRED", results)).toBe(false);
  });
});

describe("EXPIRED và cách tính hạn", () => {
  const atDate = (expiration: string) =>
    run({
      completionDate: field("2025-01-01"),
      expirationDate: field(expiration),
    });

  it("hạn trước asOf thì không qua; đúng asOf và sau asOf thì qua", () => {
    expect(passes("EXPIRED", atDate("2026-11-04"))).toBe(false);
    expect(passes("EXPIRED", atDate(AS_OF))).toBe(true);
    expect(passes("EXPIRED", atDate("2026-11-06"))).toBe(true);
  });

  it("hết hạn cũng không tự từ chối, chỉ chuyển người duyệt", () => {
    expect(route(atDate("2026-11-04"))).toEqual({
      decision: "needs_review",
      reasons: ["EXPIRED"],
    });
  });

  it.each([
    ["Valid 2 years", "2024-11-05", true],
    ["Valid 2 years", "2024-11-04", false],
    ["valid for 24 months", "2024-11-05", true],
    ["24 MONTHS", "2024-11-04", false],
    ["Valid one year", "2025-11-05", true],
    ["Valid one year", "2025-11-04", false],
    ["2 yrs", "2024-11-05", true],
    ["two-year certification", "2024-11-05", true],
  ])("hiệu lực %s, học ngày %s → còn hạn: %s", (text, completion, expected) => {
    const results = run({
      completionDate: field(completion),
      expirationDate: empty,
      validityText: field(text),
    });
    expect(passes("EXPIRED", results)).toBe(expected);
    expect(passes("DATE_INCONSISTENT", results)).toBe(true);
  });

  it("không in hạn, không ghi hiệu lực: dùng defaultValidityMonths", () => {
    const at = (completion: string) =>
      run({ completionDate: field(completion), expirationDate: empty });
    expect(passes("EXPIRED", at("2024-11-05"))).toBe(true);
    expect(passes("EXPIRED", at("2024-11-04"))).toBe(false);
  });

  it("năm nhuận: học 2024-02-29, hiệu lực 2 năm, hết hạn 2026-02-28", () => {
    const at = (asOf: string) =>
      run(
        {
          completionDate: field("2024-02-29"),
          expirationDate: empty,
          validityText: field("Valid 2 years"),
        },
        { asOf },
      );
    expect(passes("EXPIRED", at("2026-02-28"))).toBe(true);
    expect(passes("EXPIRED", at("2026-03-01"))).toBe(false);
  });

  it("thiếu ngày học và thiếu hạn: không xác định được nên không qua", () => {
    const results = run({ completionDate: empty, expirationDate: empty });
    expect(passes("EXPIRED", results)).toBe(false);
  });

  it("thiếu cấu hình hiệu lực mặc định: không qua", () => {
    const results = run(
      { expirationDate: empty },
      { config: { ...CONFIG, defaultValidityMonths: {} } },
    );
    expect(passes("EXPIRED", results)).toBe(false);
  });

  it("hạn không phải ngày thật: không xác định được nên không qua", () => {
    expect(
      passes("EXPIRED", run({ expirationDate: field("2028-02-30") })),
    ).toBe(false);
  });

  it("asOf không phải ngày thật là lỗi của phía gọi", () => {
    expect(() => run({}, { asOf: "2026-02-30" })).toThrow("asOf");
  });
});

describe("EXPIRING_SOON", () => {
  const at = (expiration: string) =>
    run({
      completionDate: field("2025-01-01"),
      expirationDate: field(expiration),
    });

  it("trong khoảng asOf tới asOf + 30 ngày thì báo, không chặn tự duyệt", () => {
    for (const date of [AS_OF, "2026-12-05"]) {
      const results = at(date);
      expect(passes("EXPIRING_SOON", results)).toBe(false);
      expect(route(results).decision).toBe("auto_approve");
    }
  });

  it("sau khoảng đó thì qua", () => {
    expect(passes("EXPIRING_SOON", at("2026-12-06"))).toBe(true);
  });

  it("đã hết hạn thì để EXPIRED báo", () => {
    expect(passes("EXPIRING_SOON", at("2026-11-04"))).toBe(true);
  });

  it("không xác định được hạn thì để EXPIRED báo", () => {
    const results = run({ completionDate: empty, expirationDate: empty });
    expect(passes("EXPIRING_SOON", results)).toBe(true);
  });
});

describe("NAME_MISMATCH", () => {
  it("LAST, FIRST và alias thì qua", () => {
    expect(
      passes("NAME_MISMATCH", run({ holderName: field("OSTROWE, MAREN") })),
    ).toBe(true);
    expect(
      passes("NAME_MISMATCH", run({ holderName: field("Maren Whitlock") })),
    ).toBe(true);
  });

  it("người khác và thiếu tên thì không qua", () => {
    expect(
      passes("NAME_MISMATCH", run({ holderName: field("Karen Ostrowe") })),
    ).toBe(false);
    expect(passes("NAME_MISMATCH", run({ holderName: empty }))).toBe(false);
  });
});

describe("ISSUER_NOT_ACCEPTED", () => {
  it("khác hoa thường thì qua", () => {
    expect(
      passes(
        "ISSUER_NOT_ACCEPTED",
        run({ issuerName: field("NORTHBRIDGE SAFETY COUNCIL") }),
      ),
    ).toBe(true);
  });

  it("không có trong danh sách, hoặc thiếu tên thì không qua", () => {
    expect(
      passes(
        "ISSUER_NOT_ACCEPTED",
        run({ issuerName: field("Harrowgate First Aid Academy") }),
      ),
    ).toBe(false);
    expect(passes("ISSUER_NOT_ACCEPTED", run({ issuerName: empty }))).toBe(
      false,
    );
  });

  it("config không có danh sách, hoặc danh sách rỗng thì không qua", () => {
    for (const acceptedIssuers of [{}, { cpr_card: [] }]) {
      expect(
        passes(
          "ISSUER_NOT_ACCEPTED",
          run({}, { config: { ...CONFIG, acceptedIssuers } }),
        ),
      ).toBe(false);
    }
  });
});

describe("bất biến: làm hỏng một trường của thẻ tốt thì không tự duyệt", () => {
  const names = Object.keys(goodFields()) as FieldName[];
  // `validityText` của thẻ tốt vốn null, `cardNumber` là tuỳ chọn.
  // `expirationDate` null là ca hợp lệ theo doc-types.md: tính từ defaultValidityMonths.
  const nullAllowed = new Set<FieldName>([
    "validityText",
    "cardNumber",
    "expirationDate",
  ]);
  const lowConfidenceAllowed = new Set<FieldName>([
    "validityText",
    "cardNumber",
  ]);
  const noEvidenceAllowed = new Set<FieldName>(["validityText"]);

  it.each(names.filter((n) => !nullAllowed.has(n)))("%s null", (name) => {
    expect(route(run({ [name]: empty })).decision).toBe("needs_review");
  });

  it.each(names.filter((n) => !noEvidenceAllowed.has(n)))(
    "%s mất evidence",
    (name) => {
      const results = run({
        [name]: { ...goodFields()[name], evidence: null },
      });
      expect(route(results).decision).toBe("needs_review");
    },
  );

  it.each(names.filter((n) => !lowConfidenceAllowed.has(n)))(
    "%s confidence 0",
    (name) => {
      const results = run({ [name]: { ...goodFields()[name], confidence: 0 } });
      expect(route(results).decision).toBe("needs_review");
    },
  );

  it("không có đường nào ra quyết định từ chối", () => {
    const decisions = new Set(
      names.map((name) => route(run({ [name]: empty })).decision),
    );
    for (const decision of decisions) {
      expect(["auto_approve", "needs_review"]).toContain(decision);
    }
  });
});

// Mỗi ca chỉ làm trượt đúng một rule, nên tắt rule đó là thẻ hỏng được tự duyệt và test đỏ.
describe("bất biến: mỗi rule block tự mình chặn được tự duyệt", () => {
  const cases: [RuleCode, Partial<Fields>, Partial<RuleInput>][] = [
    ["WRONG_DOC_TYPE", {}, { declaredDocType: "tb_test" }],
    ["MISSING_FIELD", { courseType: empty }, {}],
    [
      "MISSING_EVIDENCE",
      { cardNumber: { ...field("NSC-1"), evidence: null } },
      {},
    ],
    ["LOW_CONFIDENCE", { courseType: field("Adult CPR", 0.5) }, {}],
    ["DATE_INCONSISTENT", { completionDate: field("2026-11-06") }, {}],
    ["NAME_MISMATCH", { holderName: field("Karen Ostrowe") }, {}],
    [
      "EXPIRED",
      {
        completionDate: field("2024-01-01"),
        expirationDate: field("2026-01-01"),
      },
      {},
    ],
    ["ISSUER_NOT_ACCEPTED", { issuerName: field("Harrowgate Academy") }, {}],
  ];

  it("phủ mọi rule block của CPR", () => {
    const block = RULES_BY_DOC_TYPE.cpr_card
      .filter((d) => d.severity === "block")
      .map((d) => d.code);
    expect(cases.map(([code]) => code).sort()).toEqual([...block].sort());
  });

  it.each(cases)("%s", (code, patch, input) => {
    expect(route(run(patch, input))).toEqual({
      decision: "needs_review",
      reasons: [code],
    });
  });
});

describe("loại giấy khác CPR", () => {
  it("chưa có rule: trả rỗng, route ra NO_RULES_EVALUATED", () => {
    const results = evaluateRules({
      extraction: {
        docType: "vaccination_record",
        fields: {
          holderName: field("Maren Ostrowe"),
          vaccine: field("Flu"),
          doseDate: field("2026-01-01"),
          providerName: field("Fernhollow"),
        },
      },
      classification: { docType: "vaccination_record", confidence: 0.99 },
      staff: STAFF,
      config: CONFIG,
      asOf: AS_OF,
    });
    expect(results).toEqual([]);
    expect(route(results)).toEqual({
      decision: "needs_review",
      reasons: ["NO_RULES_EVALUATED"],
    });
  });
});

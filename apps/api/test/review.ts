import type { Extraction, RuleCode } from "@credflow/contracts";
import { contractFixture } from "./contract-fixtures.js";
import { makeProcessedDocument } from "./db.js";

// Helper cho integration test của API duyệt (plan 27). Dữ liệu từ fixture contract (SAMPLE, hư cấu).

/** Extraction CPR từ fixture, đổi `expirationDate` (null = không đọc được hạn). */
export function cprExtraction(expirationDate: string | null): Extraction {
  const base = contractFixture("Extraction", "thẻ CPR in ngày hết hạn");
  if (base.docType !== "cpr_card") throw new Error("fixture không phải CPR");
  return {
    docType: "cpr_card",
    fields: {
      ...base.fields,
      expirationDate: {
        value: expirationDate,
        confidence: 0.97,
        evidence:
          expirationDate === null ? null : { quote: `Exp ${expirationDate}` },
      },
    },
  };
}

/** Document `needs_review` hợp lệ theo mọi CHECK, với hạn và lý do tuỳ chọn. */
export function needsReviewDocument(
  staffId: string,
  opts: {
    expirationDate?: string | null;
    reasons?: RuleCode[];
    createdAt?: Date;
    asOf?: string;
  } = {},
) {
  const reasons = opts.reasons ?? ["ISSUER_NOT_ACCEPTED"];
  return makeProcessedDocument(staffId, "needs_review", {
    extraction: cprExtraction(
      opts.expirationDate === undefined ? "2028-04-19" : opts.expirationDate,
    ),
    routing: { decision: "needs_review", reasons },
    ...(opts.createdAt === undefined ? {} : { createdAt: opts.createdAt }),
    ...(opts.asOf === undefined ? {} : { asOf: opts.asOf }),
  });
}

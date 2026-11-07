import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Correction } from "@credflow/contracts";
import type { Db } from "../src/db/db.provider.js";
import { documents, staff, users } from "../src/db/schema.js";
import { loadCorrectionsReport } from "../src/review/corrections-report.js";
import { ReviewActionsRepository } from "../src/review/review-actions.repository.js";
import {
  createTestDb,
  makeProcessedDocument,
  makeStaff,
  makeUser,
  truncateAll,
} from "./db.js";

// Plan 29: báo cáo trường hay bị sửa, đọc thẳng review_actions (không cần app Nest).

const EXP = "fields.expirationDate.value";
const NAME = "fields.holderName.value";
const CARD = "fields.cardNumber.value";

describe("loadCorrectionsReport (plan 29)", () => {
  let db: Db;
  let close: () => Promise<void>;
  let repo: ReviewActionsRepository;
  let reviewerId: string;
  let staffId: string;

  async function newDocument() {
    const doc = makeProcessedDocument(staffId, "approved");
    await db.insert(documents).values(doc);
    return doc.id;
  }
  const act = (
    documentId: string,
    action: "approve" | "reject" | "request_reupload",
    corrections: Correction[],
  ) =>
    repo.insert(db, {
      documentId,
      reviewerId,
      action,
      corrections,
      note: action === "approve" ? undefined : "lý do",
    });

  beforeAll(() => {
    ({ db, close } = createTestDb());
    repo = new ReviewActionsRepository(db);
  });
  afterAll(async () => {
    await close();
  });
  beforeEach(async () => {
    await truncateAll(db);
    const s = makeStaff();
    await db.insert(staff).values(s);
    staffId = s.id;
    const u = makeUser();
    await db.insert(users).values(u);
    reviewerId = u.id;
  });

  it("chưa có review_actions: tổng 0, không có trường", async () => {
    expect(await loadCorrectionsReport(db)).toEqual({
      reviewedDocuments: 0,
      actions: { approve: 0, reject: 0, request_reupload: 0 },
      fields: [],
    });
  });

  it("đếm lần sửa và giấy riêng, tách điền chỗ trống / đổi / xoá, sắp giảm dần", async () => {
    const a = await newDocument();
    const b = await newDocument();
    const c = await newDocument();
    // Giấy a: 2 action cùng sửa expirationDate → 2 lần sửa nhưng 1 giấy.
    await act(a, "request_reupload", [
      { fieldPath: EXP, before: null, after: "2027-01-01" },
    ]);
    await act(a, "approve", [
      { fieldPath: EXP, before: "2027-01-01", after: "2027-02-01" },
      { fieldPath: NAME, before: "M. Quennell", after: null },
    ]);
    await act(b, "approve", [
      { fieldPath: EXP, before: "2026-01-01", after: "2028-01-01" },
      { fieldPath: CARD, before: null, after: "NSC-1" },
    ]);
    // Giấy c: không sửa gì, vẫn tính là giấy đã duyệt.
    await act(c, "reject", []);

    const report = await loadCorrectionsReport(db);
    expect(report.reviewedDocuments).toBe(3);
    expect(report.actions).toEqual({
      approve: 2,
      reject: 1,
      request_reupload: 1,
    });
    expect(report.fields).toEqual([
      {
        fieldPath: EXP,
        corrections: 3,
        documents: 2,
        filledEmpty: 1,
        changed: 2,
        cleared: 0,
      },
      {
        fieldPath: CARD,
        corrections: 1,
        documents: 1,
        filledEmpty: 1,
        changed: 0,
        cleared: 0,
      },
      {
        fieldPath: NAME,
        corrections: 1,
        documents: 1,
        filledEmpty: 0,
        changed: 0,
        cleared: 1,
      },
    ]);
  });
});

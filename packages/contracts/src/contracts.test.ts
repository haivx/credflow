import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ApiError,
  AuthUser,
  DecisionRequest,
  DocumentRecord,
  DocumentView,
  Extraction,
  Schemas,
  type SchemaName,
  LoginRequest,
  ProcessDocumentJob,
  ReviewQueueQuery,
  StaffListQuery,
  UploadDocumentFields,
} from "./index.js";

const FIXTURE_DIR = join(import.meta.dirname, "..", "fixtures");

interface FixtureCase {
  name: string;
  data: unknown;
}

describe("fixtures", () => {
  const files = readdirSync(FIXTURE_DIR).filter((f) => f.endsWith(".json"));

  it("có ít nhất một fixture", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    const name = file.replace(/\.json$/, "") as SchemaName;
    const cases = JSON.parse(
      readFileSync(join(FIXTURE_DIR, file), "utf8"),
    ) as FixtureCase[];

    for (const c of cases) {
      it(`${name}: ${c.name}`, () => {
        const schema = Schemas[name];
        expect(schema, `không có schema ${name}`).toBeDefined();
        const result = schema.safeParse(c.data);
        expect(result.success, JSON.stringify(result.error?.issues)).toBe(true);
      });
    }
  }
});

describe("Extraction", () => {
  it("từ chối docType không khớp với fields", () => {
    const bad = { docType: "tb_test", fields: { holderName: null } };
    expect(Extraction.safeParse(bad).success).toBe(false);
  });
});

describe("DocumentRecord", () => {
  it("từ chối checksum không phải sha256 hex chữ thường", () => {
    const cases = readFileSync(
      join(FIXTURE_DIR, "DocumentRecord.json"),
      "utf8",
    );
    const [first] = JSON.parse(cases) as [FixtureCase];
    const doc = first.data as Record<string, unknown>;
    for (const checksum of ["abc", "A".repeat(64), "g".repeat(64)]) {
      expect(DocumentRecord.safeParse({ ...doc, checksum }).success).toBe(
        false,
      );
    }
  });
});

describe("ApiError", () => {
  it("từ chối mã lỗi ngoài ErrorCode", () => {
    expect(ApiError.safeParse({ code: "TEAPOT", message: "x" }).success).toBe(
      false,
    );
  });
});

describe("StaffListQuery", () => {
  it("nhận query rỗng và query có role, region", () => {
    expect(StaffListQuery.safeParse({}).success).toBe(true);
    expect(
      StaffListQuery.safeParse({ role: "nurse", region: "north" }).success,
    ).toBe(true);
  });

  it("từ chối role rỗng và key lạ", () => {
    expect(StaffListQuery.safeParse({ role: "" }).success).toBe(false);
    expect(StaffListQuery.safeParse({ foo: "1" }).success).toBe(false);
  });
});

describe("LoginRequest", () => {
  it("nhận email + mật khẩu", () => {
    expect(
      LoginRequest.safeParse({ email: "a@example.test", password: "x" })
        .success,
    ).toBe(true);
  });

  it("từ chối email sai, mật khẩu rỗng và key lạ", () => {
    expect(
      LoginRequest.safeParse({ email: "khong-phai-email", password: "x" })
        .success,
    ).toBe(false);
    expect(
      LoginRequest.safeParse({ email: "a@example.test", password: "" }).success,
    ).toBe(false);
    expect(
      LoginRequest.safeParse({
        email: "a@example.test",
        password: "x",
        role: "admin",
      }).success,
    ).toBe(false);
  });
});

describe("AuthUser", () => {
  it("từ chối vai trò ngoài UserRole", () => {
    expect(
      AuthUser.safeParse({
        id: "u1",
        email: "a@example.test",
        role: "root",
        staffId: null,
      }).success,
    ).toBe(false);
  });
});

describe("ProcessDocumentJob", () => {
  it("nhận job có documentId", () => {
    expect(ProcessDocumentJob.parse({ documentId: "01ABC" })).toEqual({
      documentId: "01ABC",
    });
  });

  it.each([{}, { documentId: 123 }, { documentId: "" }, null])(
    "từ chối %j",
    (data) => {
      expect(ProcessDocumentJob.safeParse(data).success).toBe(false);
    },
  );
});

describe("UploadDocumentFields", () => {
  it("cho phép bỏ trống declaredDocType", () => {
    expect(UploadDocumentFields.safeParse({}).success).toBe(true);
  });

  it("từ chối loại giấy lạ và field thừa (staffId không được gửi từ form)", () => {
    expect(
      UploadDocumentFields.safeParse({ declaredDocType: "passport" }).success,
    ).toBe(false);
    expect(UploadDocumentFields.safeParse({ staffId: "s1" }).success).toBe(
      false,
    );
  });
});

describe("DocumentView", () => {
  it("parse một DocumentRecord đầy đủ thì bỏ storageKey và checksum", () => {
    const cases = readFileSync(
      join(FIXTURE_DIR, "DocumentRecord.json"),
      "utf8",
    );
    const [first] = JSON.parse(cases) as [FixtureCase];
    const view = DocumentView.parse(first.data);
    expect(view).not.toHaveProperty("storageKey");
    expect(view).not.toHaveProperty("checksum");
    expect(view.status).toBe("needs_review");
    expect(view).not.toHaveProperty("lastReview");
  });

  it("lastReview không mang reviewerId, corrections (parse bỏ key lạ)", () => {
    const cases = JSON.parse(
      readFileSync(join(FIXTURE_DIR, "DocumentView.json"), "utf8"),
    ) as FixtureCase[];
    const base = DocumentView.parse(cases[1]?.data);
    const view = DocumentView.parse({
      ...base,
      lastReview: {
        action: "reject",
        note: "Sai tên",
        decidedAt: "2026-10-28T08:00:00Z",
        reviewerId: "01JREV000000000000000001",
        corrections: [],
      },
    });
    expect(view.lastReview).toEqual({
      action: "reject",
      note: "Sai tên",
      decidedAt: "2026-10-28T08:00:00Z",
    });
  });
});

describe("DecisionRequest", () => {
  it("approve không cần note, corrections mặc định rỗng", () => {
    const req = DecisionRequest.parse({ action: "approve", version: 2 });
    expect(req.corrections).toEqual([]);
  });

  it.each(["reject", "request_reupload"] as const)(
    "%s thiếu note hoặc note chỉ có khoảng trắng → lỗi ở path note",
    (action) => {
      for (const note of [undefined, "", "   "]) {
        const result = DecisionRequest.safeParse({ action, version: 1, note });
        expect(result.success).toBe(false);
        expect(result.error?.issues[0]?.path).toEqual(["note"]);
      }
      expect(
        DecisionRequest.safeParse({ action, version: 1, note: "Mờ" }).success,
      ).toBe(true);
    },
  );

  it("từ chối version < 1, key lạ", () => {
    expect(
      DecisionRequest.safeParse({ action: "approve", version: 0 }).success,
    ).toBe(false);
    expect(
      DecisionRequest.safeParse({
        action: "approve",
        version: 1,
        reviewerId: "x",
      }).success,
    ).toBe(false);
  });
});

describe("ReviewQueueQuery", () => {
  it("mặc định sort=due, limit=20; limit từ chuỗi query", () => {
    expect(ReviewQueueQuery.parse({})).toEqual({ sort: "due", limit: 20 });
    expect(ReviewQueueQuery.parse({ limit: "5" }).limit).toBe(5);
  });

  it("từ chối reason lạ, limit quá lớn, key lạ", () => {
    expect(ReviewQueueQuery.safeParse({ reason: "FOO" }).success).toBe(false);
    expect(ReviewQueueQuery.safeParse({ limit: "101" }).success).toBe(false);
    expect(ReviewQueueQuery.safeParse({ status: "approved" }).success).toBe(
      false,
    );
  });
});

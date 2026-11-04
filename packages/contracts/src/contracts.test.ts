import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ApiError,
  AuthUser,
  DocumentRecord,
  Extraction,
  Schemas,
  type SchemaName,
  LoginRequest,
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

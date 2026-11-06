import type { RulesConfigInput } from "@credflow/contracts";
import { describe, expect, it } from "vitest";
import { requiredDocTypes } from "./index.js";

// Plan 26: loại giấy một vai trò phải có, hợp theo config của mọi khách hàng của staff.

const config = (
  name: string,
  roles: RulesConfigInput["roles"],
): RulesConfigInput => ({
  version: 1,
  name,
  minFieldConfidence: 0.85,
  expiringSoonDays: 30,
  roles,
  defaultValidityMonths: {},
  acceptedIssuers: {},
});

describe("requiredDocTypes", () => {
  const a = config("alpha", {
    caregiver: { required: ["vaccination_record", "cpr_card", "tb_test"] },
  });
  const b = config("bravo", {
    caregiver: { required: ["background_check", "cpr_card"] },
    nurse: { required: ["professional_license"] },
  });

  it("một config: đúng danh sách, sắp theo thứ tự DocType", () => {
    expect(requiredDocTypes([a], "caregiver")).toEqual([
      "cpr_card",
      "tb_test",
      "vaccination_record",
    ]);
  });

  it("nhiều config: hợp, không trùng, thứ tự ổn định", () => {
    expect(requiredDocTypes([a, b], "caregiver")).toEqual(
      requiredDocTypes([b, a], "caregiver"),
    );
    expect(requiredDocTypes([a, b], "caregiver")).toEqual([
      "cpr_card",
      "tb_test",
      "background_check",
      "vaccination_record",
    ]);
  });

  it("config không có vai trò thì không thêm gì", () => {
    expect(requiredDocTypes([a, b], "nurse")).toEqual(["professional_license"]);
  });

  it("không config nào có vai trò: undefined (không bao giờ coi là đủ)", () => {
    expect(requiredDocTypes([a, b], "janitor")).toBeUndefined();
    expect(requiredDocTypes([], "caregiver")).toBeUndefined();
  });
});

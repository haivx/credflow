import { describe, expect, it } from "vitest";
import { statusFor } from "./rule-step.js";

describe("statusFor", () => {
  it("chỉ auto_approve mới ra auto_approved", () => {
    expect(statusFor("auto_approve")).toBe("auto_approved");
  });

  it("needs_review ra needs_review, không bao giờ rejected", () => {
    expect(statusFor("needs_review")).toBe("needs_review");
  });
});

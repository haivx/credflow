import { expect, it } from "vitest";

// PR thử của plan 12f: test cố ý đỏ để kiểm ruleset khoá merge. Không bao giờ merge.
it("cố ý đỏ", () => {
  expect(1).toBe(2);
});

import { DocumentStatus } from "@credflow/contracts";
import { describe, expect, it } from "vitest";
import { assertTransition, InvalidTransitionError } from "./state-machine.js";

type Pair = [from: DocumentStatus, to: DocumentStatus];

/** Hệ thống tự đi được, không cần người duyệt. */
const SYSTEM: Pair[] = [
  ["uploaded", "processing"],
  ["processing", "extracted"],
  ["processing", "needs_review"],
  ["processing", "failed"],
  ["extracted", "auto_approved"],
  ["extracted", "needs_review"],
  ["extracted", "failed"],
];

/** Quyết định của người duyệt: bắt buộc có reviewerId. */
const REVIEWER: Pair[] = [
  ["needs_review", "approved"],
  ["needs_review", "rejected"],
  ["needs_review", "reupload_requested"],
];

const isListed = ([from, to]: Pair) =>
  [...SYSTEM, ...REVIEWER].some(([f, t]) => f === from && t === to);

/** Mọi cặp còn lại, kể cả đứng yên (processing → processing). */
const FORBIDDEN: Pair[] = DocumentStatus.options
  .flatMap((from) => DocumentStatus.options.map((to): Pair => [from, to]))
  .filter((pair) => !isListed(pair));

describe("assertTransition", () => {
  it.each(SYSTEM)("%s → %s: hệ thống được đi", (from, to) => {
    expect(() => {
      assertTransition(from, to);
    }).not.toThrow();
  });

  it.each(REVIEWER)("%s → %s: có reviewerId thì được", (from, to) => {
    expect(() => {
      assertTransition(from, to, { reviewerId: "01REVIEWER" });
    }).not.toThrow();
  });

  it.each(REVIEWER)("%s → %s: thiếu reviewerId thì không", (from, to) => {
    expect(() => {
      assertTransition(from, to);
    }).toThrow(InvalidTransitionError);
  });

  it.each(REVIEWER)("%s → %s: reviewerId rỗng cũng không", (from, to) => {
    expect(() => {
      assertTransition(from, to, { reviewerId: "" });
    }).toThrow(InvalidTransitionError);
  });

  it.each(FORBIDDEN)("%s → %s: không có trong bảng", (from, to) => {
    expect(() => {
      assertTransition(from, to);
    }).toThrow(InvalidTransitionError);
  });

  // Có reviewerId cũng không mở được cặp ngoài bảng, ví dụ processing → rejected.
  it.each(FORBIDDEN)("%s → %s: có reviewerId vẫn không", (from, to) => {
    expect(() => {
      assertTransition(from, to, { reviewerId: "01REVIEWER" });
    }).toThrow(InvalidTransitionError);
  });

  it("lỗi cho biết đi từ đâu sang đâu", () => {
    let caught: unknown;
    try {
      assertTransition("uploaded", "auto_approved");
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(InvalidTransitionError);
    expect(caught).toMatchObject({ from: "uploaded", to: "auto_approved" });
  });
});

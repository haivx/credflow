import { describe, expect, it } from "vitest";
import {
  decodeCursor,
  encodeCursor,
  type QueueCursor,
} from "./queue-cursor.js";

const cursor: QueueCursor = {
  sort: "due",
  reason: "EXPIRED",
  k: "2027-01-31",
  id: "01TESTDOC0001",
};

describe("queue cursor", () => {
  it("encode rồi decode ra đúng cursor", () => {
    expect(
      decodeCursor(encodeCursor(cursor), { sort: "due", reason: "EXPIRED" }),
    ).toEqual(cursor);
  });

  it("cursor của sort/reason khác → undefined", () => {
    const raw = encodeCursor(cursor);
    expect(
      decodeCursor(raw, { sort: "submitted", reason: "EXPIRED" }),
    ).toBeUndefined();
    expect(decodeCursor(raw, { sort: "due", reason: null })).toBeUndefined();
  });

  it.each([
    ["không phải base64 JSON", "%%%"],
    ["JSON sai hình dạng", Buffer.from('{"sort":"due"}').toString("base64url")],
    [
      "key lạ",
      Buffer.from(JSON.stringify({ ...cursor, x: 1 })).toString("base64url"),
    ],
  ])("%s → undefined", (_name, raw) => {
    expect(
      decodeCursor(raw, { sort: "due", reason: "EXPIRED" }),
    ).toBeUndefined();
  });
});

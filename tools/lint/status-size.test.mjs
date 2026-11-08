// docs/STATUS.md phải ngắn (plan 37): agent đọc file này đầu mỗi phiên. Lời nhắc "dưới 40 dòng"
// đã bị vượt hai lần (5KB rồi 12KB), nên giữ bằng máy. Vượt thì chuyển phần cũ sang docs/archive/,
// không nới con số này.
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const MAX_LINES = 40;
const path = new URL("../../docs/STATUS.md", import.meta.url);

describe("docs/STATUS.md", () => {
  it(`không quá ${MAX_LINES} dòng`, () => {
    const lines = readFileSync(path, "utf8").trimEnd().split("\n").length;
    assert.ok(
      lines <= MAX_LINES,
      `docs/STATUS.md có ${lines} dòng (tối đa ${MAX_LINES}). Chuyển lịch sử, danh sách merge, eval cũ sang docs/archive/, chỉ giữ Đang làm, Tiếp theo, Vướng, Eval mới nhất.`,
    );
  });
});

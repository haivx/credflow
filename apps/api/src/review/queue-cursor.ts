import { parseJson, RuleCode, ReviewQueueSort } from "@credflow/contracts";
import * as z from "zod";

/**
 * Vị trí dòng cuối của trang trước (keyset, plan 27). `k` là khoá sắp xếp dạng chuỗi do Postgres trả
 * (`due_key`, hoặc `created_at::text` giữ đủ micro giây: Date của JS chỉ có mili giây, so lại sẽ lặp dòng).
 * Gắn `sort` và `reason` để cursor của bộ lọc này không bị dùng nhầm cho bộ lọc khác.
 * Không ký: client sửa cursor chỉ làm lệch trang của chính họ (ghi "Học nâng cao": HMAC).
 */
export const QueueCursor = z.strictObject({
  sort: ReviewQueueSort,
  reason: RuleCode.nullable(),
  k: z.string().min(1),
  id: z.string().min(1),
});
export type QueueCursor = z.infer<typeof QueueCursor>;

export function encodeCursor(cursor: QueueCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

/** `undefined` khi cursor hỏng hoặc không khớp `sort`/`reason` đang hỏi: caller trả 400. */
export function decodeCursor(
  raw: string,
  expected: { sort: QueueCursor["sort"]; reason: QueueCursor["reason"] },
): QueueCursor | undefined {
  let cursor: QueueCursor;
  try {
    cursor = parseJson(
      QueueCursor,
      Buffer.from(raw, "base64url").toString("utf8"),
    );
  } catch {
    // JSON hỏng hoặc sai hình dạng: cùng một lỗi cho client.
    return undefined;
  }
  if (cursor.sort !== expected.sort || cursor.reason !== expected.reason) {
    return undefined;
  }
  return cursor;
}

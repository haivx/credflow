/**
 * Như `Promise.all(items.map(fn))` nhưng không quá `limit` việc chạy cùng lúc, để tôn trọng
 * rate limit của provider. Kết quả giữ đúng thứ tự `items`. Một việc lỗi thì reject bằng lỗi đó
 * (các việc đang chạy vẫn chạy nốt, không nhận việc mới).
 */
export async function mapWithLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error(`limit phải là số nguyên ≥ 1, nhận ${String(limit)}`);
  }
  const results = new Array<R>(items.length);
  // Một iterator dùng chung: mỗi lần `next()` trả một việc khác nhau cho worker gọi nó.
  const queue = items.entries();
  let failed = false;

  async function worker(): Promise<void> {
    for (const [index, item] of queue) {
      if (failed) return;
      try {
        results[index] = await fn(item, index);
      } catch (err) {
        failed = true;
        throw err;
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
  return results;
}

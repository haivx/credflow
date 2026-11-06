import { describe, expect, it } from "vitest";
import { mapWithLimit } from "./limit.js";

const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

describe("mapWithLimit", () => {
  it("không quá `limit` việc chạy cùng lúc, kết quả giữ thứ tự input", async () => {
    let running = 0;
    let peak = 0;
    const result = await mapWithLimit([5, 1, 4, 2, 3, 6, 7], 3, async (n) => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, n * 3));
      running -= 1;
      return n * 10;
    });
    expect(result).toEqual([50, 10, 40, 20, 30, 60, 70]);
    expect(peak).toBe(3);
  });

  it("ít việc hơn limit, và mảng rỗng", async () => {
    expect(await mapWithLimit([1], 3, (n) => Promise.resolve(n + 1))).toEqual([
      2,
    ]);
    expect(
      await mapWithLimit([], 3, (n: number) => Promise.resolve(n)),
    ).toEqual([]);
  });

  it("một việc lỗi thì promise bị reject bằng lỗi đó", async () => {
    await expect(
      mapWithLimit([1, 2, 3], 2, async (n) => {
        await tick();
        if (n === 2) throw new Error("hỏng");
        return n;
      }),
    ).rejects.toThrow("hỏng");
  });

  it("limit < 1 là lỗi cấu hình", async () => {
    await expect(
      mapWithLimit([1], 0, (n) => Promise.resolve(n)),
    ).rejects.toThrow();
  });
});

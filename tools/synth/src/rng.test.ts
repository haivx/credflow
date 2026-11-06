import { describe, expect, it } from "vitest";
import { createRng } from "./rng.js";

const sample = (seed: number) => {
  const rng = createRng(seed);
  return Array.from({ length: 1000 }, () => rng.next());
};

describe("createRng", () => {
  it("cùng seed → cùng chuỗi; khác seed → khác chuỗi", () => {
    expect(sample(1)).toEqual(sample(1));
    expect(sample(2)).not.toEqual(sample(1));
  });

  it("next() nằm trong [0, 1)", () => {
    for (const value of sample(7)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it("int(min, max) gồm cả hai đầu và phủ đủ khoảng", () => {
    const rng = createRng(3);
    const seen = new Set(Array.from({ length: 500 }, () => rng.int(2, 5)));
    expect([...seen].sort()).toEqual([2, 3, 4, 5]);
  });

  it("pick, shuffle: tất định theo seed, shuffle không làm mất phần tử, không sửa mảng gốc", () => {
    const items = ["a", "b", "c", "d", "e"];
    const a = createRng(9);
    const b = createRng(9);
    expect(a.shuffle(items)).toEqual(b.shuffle(items));
    expect([...createRng(4).shuffle(items)].sort()).toEqual(items);
    expect(items).toEqual(["a", "b", "c", "d", "e"]);
    expect(createRng(5).pick(items)).toBe(createRng(5).pick(items));
  });

  it("pick mảng rỗng là lỗi", () => {
    expect(() => createRng(1).pick([])).toThrow();
  });
});

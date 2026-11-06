/** Random có seed. Mọi lựa chọn ngẫu nhiên của synth đi qua đây để cùng seed ra cùng dữ liệu. */
export interface Rng {
  /** Số thực trong [0, 1). */
  next(): number;
  /** Số nguyên trong [min, max], gồm cả hai đầu. */
  int(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
  /** Bản sao đã xáo (Fisher–Yates); không sửa mảng gốc. */
  shuffle<T>(items: readonly T[]): T[];
}

/**
 * mulberry32: PRNG 32-bit nhỏ, đủ cho dữ liệu thử (không dùng cho bảo mật).
 * Thứ tự gọi `next()` quyết định kết quả, nên code sinh dữ liệu phải gọi theo thứ tự cố định.
 */
export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number) =>
    min + Math.floor(next() * (max - min + 1));

  return {
    next,
    int,
    pick<T>(items: readonly T[]): T {
      if (items.length === 0) throw new Error("pick: mảng rỗng");
      return items[int(0, items.length - 1)] as T;
    },
    shuffle<T>(items: readonly T[]): T[] {
      const copy = [...items];
      for (let i = copy.length - 1; i > 0; i--) {
        const j = int(0, i);
        [copy[i], copy[j]] = [copy[j] as T, copy[i] as T];
      }
      return copy;
    },
  };
}

import type { ValueProvider } from "@nestjs/common";

export const CLOCK = Symbol("CLOCK");

/** Nguồn "hôm nay" cho rule engine. Test thay bằng ngày cố định. */
export interface Clock {
  /** Ngày UTC hiện tại dạng YYYY-MM-DD (ADR 0010). */
  todayUtc(): string;
}

export const systemClock: Clock = {
  todayUtc: () => new Date().toISOString().slice(0, 10),
};

export const clockProvider = {
  provide: CLOCK,
  useValue: systemClock,
} satisfies ValueProvider<Clock>;

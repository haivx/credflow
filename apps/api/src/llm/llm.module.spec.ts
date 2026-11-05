import type { ConfigService } from "@nestjs/config";
import { describe, expect, it } from "vitest";
import type { Env } from "../config/env.schema.js";
import { clientProvider } from "./llm.module.js";

const configWith = (key: string | undefined) =>
  ({ get: () => key }) as unknown as ConfigService<Env, true>;

describe("client LLM", () => {
  it("thiếu khoá: worker không khởi động", () => {
    expect(() => clientProvider.useFactory(configWith(undefined))).toThrow(
      "ANTHROPIC_API_KEY",
    );
  });

  it("SDK không tự retry: BullMQ lo, tránh một document gọi tới 9 lần", () => {
    expect(clientProvider.useFactory(configWith("k")).maxRetries).toBe(0);
  });
});

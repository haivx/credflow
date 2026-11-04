import { describe, it, expect } from "vitest";
import { envSchema } from "./env.schema.js";

const baseValidEnv = {
  ANTHROPIC_API_KEY: "some-key",
  DATABASE_URL: "postgres://credflow:credflow@localhost:5432/credflow",
  API_PORT: "3000",
  REDIS_URL: "redis://localhost:6379",
  API_HOST: "localhost",
  DATA_DIR: "./data",
};

describe("envSchema", () => {
  it("parse env is valid, API_PORT is number", () => {
    const result = envSchema.safeParse(baseValidEnv);

    expect(result.success).toBe(true);
    expect(result.data?.API_PORT).toBe(3000);
  });

  it("fills defaults when only required vars are set", () => {
    const result = envSchema.safeParse({
      DATABASE_URL: baseValidEnv.DATABASE_URL,
      REDIS_URL: baseValidEnv.REDIS_URL,
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      DATABASE_URL: baseValidEnv.DATABASE_URL,
      REDIS_URL: baseValidEnv.REDIS_URL,
      API_PORT: 8787,
      API_HOST: "127.0.0.1",
      DATA_DIR: "./data",
      SESSION_TTL_DAYS: 7,
      COOKIE_SECURE: false,
      UPLOAD_MAX_BYTES: 10485760,
    });
  });

  it("reports every missing required var", () => {
    const result = envSchema.safeParse({});

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.path)).toEqual([
      ["DATABASE_URL"],
      ["REDIS_URL"],
    ]);
  });

  it.each([
    ["not a number", "abc"],
    ["empty string", ""],
    ["not an integer", "8787.5"],
    ["above 65535", "70000"],
  ])("rejects API_PORT when %s (%j)", (_label, value) => {
    const result = envSchema.safeParse({ ...baseValidEnv, API_PORT: value });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.path)).toEqual([["API_PORT"]]);
  });

  it("accepts API_PORT at the upper bound 65535", () => {
    const result = envSchema.safeParse({ ...baseValidEnv, API_PORT: "65535" });

    expect(result.success).toBe(true);
    expect(result.data?.API_PORT).toBe(65535);
  });

  it("rejects an empty ANTHROPIC_API_KEY (empty string is not undefined)", () => {
    const result = envSchema.safeParse({
      ...baseValidEnv,
      ANTHROPIC_API_KEY: "",
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.path)).toEqual([
      ["ANTHROPIC_API_KEY"],
    ]);
  });

  it.each([
    ["false", false],
    ["true", true],
    ["0", false],
  ])("parses COOKIE_SECURE=%j as %s", (value, expected) => {
    const result = envSchema.safeParse({
      ...baseValidEnv,
      COOKIE_SECURE: value,
    });

    expect(result.data?.COOKIE_SECURE).toBe(expected);
  });

  it("rejects SESSION_TTL_DAYS below 1", () => {
    const result = envSchema.safeParse({
      ...baseValidEnv,
      SESSION_TTL_DAYS: "0",
    });

    expect(result.error?.issues.map((i) => i.path)).toEqual([
      ["SESSION_TTL_DAYS"],
    ]);
  });
});

import * as z from "zod";
import { describe, expect, it } from "vitest";
import { JsonSyntaxError, parseJson } from "./index.js";

const Person = z.object({
  name: z.string(),
  role: z.enum(["staff", "admin"]),
  age: z.number(),
});
// Giá trị hư cấu: không được xuất hiện trong bất kỳ lỗi nào.
const SENSITIVE = "SAMPLE-Jane-Q-Doe";

/** Lỗi `fn` ném ra, gom mọi chuỗi có thể bị log: message, stack, cause, thuộc tính. */
function thrownBy(fn: () => unknown): { error: unknown; text: string } {
  try {
    fn();
  } catch (error) {
    const text =
      error instanceof Error
        ? [
            error.message,
            error.stack ?? "",
            String(error.cause),
            JSON.stringify(error),
          ].join("\n")
        : String(error);
    return { error, text };
  }
  throw new Error("muốn fn ném lỗi");
}

describe("parseJson", () => {
  it("JSON đúng, khớp schema: trả dữ liệu đã parse và bỏ field lạ", () => {
    const text = JSON.stringify({
      name: "Zara",
      role: "staff",
      age: 30,
      extra: "bỏ",
    });
    expect(parseJson(Person, text)).toEqual({
      name: "Zara",
      role: "staff",
      age: 30,
    });
  });

  it("sai cú pháp: ném JsonSyntaxError, không có cause", () => {
    const { error } = thrownBy(() => parseJson(Person, "{khong-phai-json"));
    expect(error).toBeInstanceOf(JsonSyntaxError);
    expect((error as Error).cause).toBeUndefined();
  });

  it.each([
    ["toàn bộ là chuỗi", SENSITIVE],
    ["giữa object", `{"name":${SENSITIVE}}`],
    ["giữa object, đầu input", `${SENSITIVE}{"a":1}`],
  ])("sai cú pháp, %s: lỗi không chứa input", (_name, text) => {
    // Điều kiện để test có nghĩa: SyntaxError gốc đúng là chứa dữ liệu.
    const original = thrownBy(() => JSON.parse(text) as unknown);
    expect(original.text).toContain("SAMPLE");

    expect(thrownBy(() => parseJson(Person, text)).text).not.toContain(
      "SAMPLE",
    );
  });

  it("sai schema: ném ZodError, không chứa giá trị của dòng", () => {
    const text = JSON.stringify({
      name: 123,
      role: SENSITIVE,
      age: SENSITIVE,
    });
    const { error, text: logged } = thrownBy(() => parseJson(Person, text));
    expect(error).toBeInstanceOf(z.ZodError);
    expect(logged).not.toContain(SENSITIVE);
  });
});

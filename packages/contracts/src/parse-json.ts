import * as z from "zod";

/**
 * Chuỗi không phải JSON hợp lệ. Cố ý không giữ input và không gắn `cause`:
 * SyntaxError gốc in lại một đoạn dữ liệu, lọt vào log là lộ giá trị (A14).
 */
export class JsonSyntaxError extends Error {
  constructor() {
    super("JSON không hợp lệ");
    this.name = "JsonSyntaxError";
  }
}

/** Cách duy nhất đọc JSON từ ngoài (A2): lint cấm `JSON.parse` ở nơi khác. */
export function parseJson<S extends z.ZodType>(
  schema: S,
  text: string,
): z.output<S> {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new JsonSyntaxError();
  }
  return schema.parse(value);
}

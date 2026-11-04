import { describe, expect, it } from "vitest";
import { detectFileType } from "./file-type.js";

describe("detectFileType", () => {
  it("nhận PDF, PNG, JPEG theo magic bytes", () => {
    expect(detectFileType(Buffer.from("%PDF-1.4\n"))).toEqual({
      mimeType: "application/pdf",
      ext: "pdf",
    });
    expect(
      detectFileType(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      ),
    ).toEqual({ mimeType: "image/png", ext: "png" });
    expect(detectFileType(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toEqual({
      mimeType: "image/jpeg",
      ext: "jpg",
    });
  });

  it("file text (kể cả khi đổi đuôi .pdf) → null", () => {
    expect(detectFileType(Buffer.from("hello SAMPLE"))).toBeNull();
  });

  it("buffer ngắn hơn chữ ký → null, không đọc lố", () => {
    expect(detectFileType(Buffer.from("%PD"))).toBeNull();
    expect(detectFileType(Buffer.alloc(0))).toBeNull();
  });
});

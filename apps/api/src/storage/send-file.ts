import { NotFoundException } from "@nestjs/common";
import type { Response } from "express";
import { pipeline } from "node:stream/promises";
import type { Storage } from "./storage.js";

/**
 * Stream file đã lưu ra response (plan 27). Caller đã kiểm quyền. `Content-Type` là mimeType server
 * đã nhận dạng lúc upload (magic bytes), `nosniff` để trình duyệt không tự đoán lại. Tên file
 * người dùng đặt không vào header.
 */
export async function sendStoredFile(
  res: Response,
  storage: Storage,
  file: { storageKey: string; mimeType: string },
): Promise<void> {
  const stream = await storage.openRead(file.storageKey);
  if (stream === null) {
    throw new NotFoundException("Không tìm thấy file");
  }
  res.status(200);
  res.setHeader("Content-Type", file.mimeType);
  res.setHeader("Content-Disposition", "inline");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "private, no-store");
  // `pipeline` huỷ stream file khi client ngắt giữa chừng, không để rò file descriptor.
  await pipeline(stream, res);
}

import { mkdir, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { testEnv } from "./test-env.js";

// Helper upload cho integration test. File test là bytes sinh trong code, có chữ SAMPLE,
// không phải giấy tờ thật (docs/data-policy.md).

export const UPLOAD_MAX_BYTES = Number(testEnv.UPLOAD_MAX_BYTES);
export const filesDir = join(testEnv.DATA_DIR, "files");
export const tmpDir = join(testEnv.DATA_DIR, "tmp");

/** PDF tối giản: chỉ cần đúng magic bytes `%PDF-`. `label` khác nhau → checksum khác nhau. */
export function samplePdf(label: string, sizeBytes?: number): Buffer {
  const head = Buffer.from(`%PDF-1.4\n% SAMPLE fictional document ${label}\n`);
  if (sizeBytes === undefined) return head;
  return Buffer.concat([head, Buffer.alloc(sizeBytes - head.length, 0x20)]);
}

export function samplePng(label: string): Buffer {
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from(`SAMPLE ${label}`),
  ]);
}

export function uploadFile(
  app: INestApplication,
  cookie: string,
  content: Buffer,
  opts: { fileName?: string; field?: string; declaredDocType?: string } = {},
) {
  const req = request(app.getHttpServer())
    .post("/documents")
    .set("Cookie", cookie);
  if (opts.declaredDocType !== undefined) {
    req.field("declaredDocType", opts.declaredDocType);
  }
  return req.attach(opts.field ?? "file", content, {
    filename: opts.fileName ?? "cpr-sample.pdf",
    contentType: "application/pdf",
  });
}

/** Xoá file của lần test trước nhưng giữ thư mục (StorageModule chỉ tạo chúng lúc khởi động). */
export async function resetDataDir() {
  await rm(filesDir, { recursive: true, force: true });
  await mkdir(filesDir, { recursive: true });
  await mkdir(tmpDir, { recursive: true });
  for (const entry of await readdir(tmpDir)) {
    await rm(join(tmpDir, entry), { force: true });
  }
}

/** Mọi file đang có trong storage, dạng key (`documents/<id>.pdf`). */
export async function storedKeys(): Promise<string[]> {
  const entries = await readdir(filesDir, {
    recursive: true,
    withFileTypes: true,
  });
  return entries
    .filter((e) => e.isFile())
    .map((e) => join(e.parentPath, e.name).slice(filesDir.length + 1))
    .sort();
}

import {
  DeleteObjectCommand,
  GetObjectCommand,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from "@aws-sdk/client-s3";
import { createReadStream } from "node:fs";
import { mkdir, rm, stat } from "node:fs/promises";
import { Readable } from "node:stream";
import type { Storage } from "./storage.js";

export interface S3StorageOptions {
  bucket: string;
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
  /** Thư mục file tạm khi đang stream upload (đĩa của container, không cần giữ lâu). */
  tmpDir: string;
}

/**
 * Lưu file trên bucket tương thích S3 (plan 33; production: Railway Bucket, ADR 0013).
 * Cần khi API và worker chạy ở hai container khác nhau: đĩa của container này container kia
 * không thấy, còn bucket thì cả hai cùng đọc/ghi qua mạng.
 * Upload vẫn stream ra file tạm trước (để tính sha256, plan 11), rồi mới đẩy lên bucket.
 */
export class S3Storage implements Storage {
  readonly tmpDir: string;
  private readonly bucket: string;
  private readonly client: S3Client;

  constructor(options: S3StorageOptions) {
    this.tmpDir = options.tmpDir;
    this.bucket = options.bucket;
    this.client = new S3Client({
      endpoint: options.endpoint,
      region: options.region,
      forcePathStyle: options.forcePathStyle,
      credentials: {
        accessKeyId: options.accessKeyId,
        secretAccessKey: options.secretAccessKey,
      },
      // SDK mới mặc định gửi checksum kiểu aws-chunked; nhiều dịch vụ "tương thích S3" chưa nhận.
      // Chỉ dùng checksum khi API bắt buộc.
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
  }

  /** Tạo thư mục tạm. Gọi một lần lúc khởi động. */
  async init(): Promise<void> {
    await mkdir(this.tmpDir, { recursive: true });
  }

  async putFromTemp(tmpPath: string, key: string): Promise<void> {
    checkKey(key);
    // Body là stream thì S3 cần biết trước độ dài.
    const { size } = await stat(tmpPath);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: createReadStream(tmpPath),
        ContentLength: size,
      }),
    );
    await rm(tmpPath, { force: true });
  }

  async read(key: string): Promise<Buffer | null> {
    const body = await this.getBody(key);
    if (body === null) return null;
    return Buffer.from(await body.transformToByteArray());
  }

  async openRead(key: string): Promise<Readable | null> {
    const body = await this.getBody(key);
    if (body === null) return null;
    // Trên Node, body của GetObject là một Readable (IncomingMessage).
    if (!(body instanceof Readable)) {
      throw new Error("GetObject không trả stream Node");
    }
    return body;
  }

  async remove(key: string): Promise<void> {
    checkKey(key);
    // S3 xoá key không tồn tại vẫn trả thành công.
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }

  private async getBody(key: string) {
    checkKey(key);
    try {
      const res = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      if (res.Body === undefined) throw new Error("GetObject không có body");
      return res.Body;
    } catch (err) {
      if (isNotFound(err)) return null;
      throw err;
    }
  }
}

/** Không có key (NoSuchKey), hoặc dịch vụ tương thích S3 chỉ trả 404. */
function isNotFound(err: unknown): boolean {
  if (err instanceof NoSuchKey) return true;
  return (
    err instanceof S3ServiceException && err.$metadata.httpStatusCode === 404
  );
}

/**
 * Key luôn do server sinh (`documents/<id>.<ext>`); key lạ là bug của server → throw, giống
 * `LocalStorage.pathOf`.
 */
function checkKey(key: string): void {
  const parts = key.split("/");
  if (
    key === "" ||
    key.startsWith("/") ||
    key.includes("\\") ||
    parts.some((p) => p === "" || p === "." || p === "..")
  ) {
    throw new Error(`Storage key không hợp lệ: ${key}`);
  }
}

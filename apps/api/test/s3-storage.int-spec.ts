import {
  DeleteObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll } from "vitest";
import { S3Storage, type S3StorageOptions } from "../src/storage/s3-storage.js";
import { describeStorageContract } from "./storage-contract.js";
import { testS3 } from "./test-env.js";

// Plan 33: S3Storage chạy với bucket thật cục bộ (service s3-test, adobe/s3mock) để kiểm
// hành vi qua giao thức S3, không mock SDK.
const options: S3StorageOptions = {
  ...testS3,
  tmpDir: join(tmpdir(), "credflow-s3-int-tmp"),
};
const client = new S3Client({
  endpoint: options.endpoint,
  region: options.region,
  forcePathStyle: true,
  credentials: {
    accessKeyId: options.accessKeyId,
    secretAccessKey: options.secretAccessKey,
  },
});

async function emptyBucket() {
  const listed = await client.send(
    new ListObjectsV2Command({ Bucket: options.bucket }),
  );
  for (const obj of listed.Contents ?? []) {
    await client.send(
      new DeleteObjectCommand({ Bucket: options.bucket, Key: obj.Key }),
    );
  }
}

// s3mock (Java) cần vài giây để nhận request sau khi container lên.
beforeAll(async () => {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await emptyBucket();
      return;
    } catch (err) {
      if (attempt >= 30) throw err;
      await new Promise((r) => setTimeout(r, 500));
    }
  }
}, 30_000);

describeStorageContract(
  "S3Storage + s3mock",
  async () => {
    const storage = new S3Storage(options);
    await storage.init();
    return storage;
  },
  async () => {
    await emptyBucket();
    await rm(options.tmpDir, { recursive: true, force: true });
  },
);

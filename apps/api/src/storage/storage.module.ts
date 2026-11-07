import { type FactoryProvider, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { Env } from "../config/env.schema.js";
import { LocalStorage } from "./local-storage.js";
import { S3Storage } from "./s3-storage.js";
import { STORAGE, type Storage } from "./storage.js";

// DATA_DIR tương đối (vd ./data) tính từ gốc repo, giống envFilePath trong config.options.ts.
// Không thì nó phụ thuộc thư mục đang chạy: `make dev-api` chạy trong apps/api nên ra apps/api/data.
const REPO_ROOT = resolve(import.meta.dirname, "../../../..");

const storageProvider = {
  provide: STORAGE,
  inject: [ConfigService],
  // Factory async: Nest chờ init() xong (tạo thư mục) rồi mới cho module khác dùng.
  // STORAGE_DRIVER (plan 33): `local` cho máy dev; `s3` khi API và worker là hai container
  // (Railway). Biến S3 đã được appEnvSchema kiểm đủ lúc khởi động.
  useFactory: async (config: ConfigService<Env, true>) => {
    const storage =
      config.get("STORAGE_DRIVER", { infer: true }) === "s3"
        ? new S3Storage({
            bucket: required(config, "S3_BUCKET"),
            endpoint: required(config, "S3_ENDPOINT"),
            region: config.get("S3_REGION", { infer: true }),
            accessKeyId: required(config, "S3_ACCESS_KEY_ID"),
            secretAccessKey: required(config, "S3_SECRET_ACCESS_KEY"),
            forcePathStyle: config.get("S3_FORCE_PATH_STYLE", { infer: true }),
            tmpDir: join(tmpdir(), "credflow-upload"),
          })
        : new LocalStorage(
            resolve(REPO_ROOT, config.get("DATA_DIR", { infer: true })),
          );
    await storage.init();
    return storage;
  },
} satisfies FactoryProvider<Storage>;

type S3Key =
  "S3_BUCKET" | "S3_ENDPOINT" | "S3_ACCESS_KEY_ID" | "S3_SECRET_ACCESS_KEY";

/** appEnvSchema đã bắt buộc các biến này khi STORAGE_DRIVER=s3; kiểm lại để có kiểu string. */
function required(config: ConfigService<Env, true>, key: S3Key): string {
  const value = config.get(key, { infer: true });
  if (value === undefined)
    throw new Error(`${key} is required when STORAGE_DRIVER=s3`);
  return value;
}

@Module({
  providers: [storageProvider],
  exports: [STORAGE],
})
export class StorageModule {}

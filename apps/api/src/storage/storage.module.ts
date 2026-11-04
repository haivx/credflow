import { type FactoryProvider, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { resolve } from "node:path";
import type { Env } from "../config/env.schema.js";
import { LocalStorage } from "./local-storage.js";
import { STORAGE, type Storage } from "./storage.js";

// DATA_DIR tương đối (vd ./data) tính từ gốc repo, giống envFilePath trong config.options.ts.
// Không thì nó phụ thuộc thư mục đang chạy: `make dev-api` chạy trong apps/api nên ra apps/api/data.
const REPO_ROOT = resolve(import.meta.dirname, "../../../..");

const storageProvider = {
  provide: STORAGE,
  inject: [ConfigService],
  // Factory async: Nest chờ init() xong (tạo thư mục) rồi mới cho module khác dùng.
  useFactory: async (config: ConfigService<Env, true>) => {
    const storage = new LocalStorage(
      resolve(REPO_ROOT, config.get("DATA_DIR", { infer: true })),
    );
    await storage.init();
    return storage;
  },
} satisfies FactoryProvider<Storage>;

@Module({
  providers: [storageProvider],
  exports: [STORAGE],
})
export class StorageModule {}

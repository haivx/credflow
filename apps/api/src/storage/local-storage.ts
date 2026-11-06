import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import type { Readable } from "node:stream";
import { dirname, resolve, sep } from "node:path";
import type { Storage } from "./storage.js";

/**
 * Lưu file trên đĩa: `<dataDir>/files/<key>`, file tạm ở `<dataDir>/tmp/`.
 * Hai thư mục cùng nằm dưới dataDir (cùng ổ đĩa) nên putFromTemp chỉ cần `rename`:
 * atomic, không copy lại dữ liệu, và không bao giờ có file đang ghi dở ở vị trí cuối.
 */
export class LocalStorage implements Storage {
  readonly tmpDir: string;
  private readonly root: string;

  constructor(dataDir: string) {
    this.root = resolve(dataDir, "files");
    this.tmpDir = resolve(dataDir, "tmp");
  }

  /** Tạo thư mục nếu chưa có. Gọi một lần lúc khởi động. */
  async init(): Promise<void> {
    await mkdir(this.root, { recursive: true });
    await mkdir(this.tmpDir, { recursive: true });
  }

  async putFromTemp(tmpPath: string, key: string): Promise<void> {
    const target = this.pathOf(key);
    await mkdir(dirname(target), { recursive: true });
    await rename(tmpPath, target);
  }

  async read(key: string): Promise<Buffer | null> {
    try {
      return await readFile(this.pathOf(key));
    } catch (err) {
      if (err instanceof Error && "code" in err && err.code === "ENOENT") {
        return null;
      }
      throw err;
    }
  }

  async openRead(key: string): Promise<Readable | null> {
    // Mở file trước rồi mới tạo stream: ENOENT ra ở đây thành null, không thành lỗi giữa lúc đang gửi.
    try {
      const handle = await open(this.pathOf(key), "r");
      // Stream đóng file khi đọc xong hoặc khi bị huỷ (autoClose mặc định).
      return handle.createReadStream();
    } catch (err) {
      if (err instanceof Error && "code" in err && err.code === "ENOENT") {
        return null;
      }
      throw err;
    }
  }

  async remove(key: string): Promise<void> {
    await rm(this.pathOf(key), { force: true });
  }

  /** Đường dẫn tuyệt đối của key. Key thoát ra ngoài root (`../`) là bug của server → throw. */
  pathOf(key: string): string {
    const path = resolve(this.root, key);
    if (!path.startsWith(this.root + sep)) {
      throw new Error(`Storage key không hợp lệ: ${key}`);
    }
    return path;
  }
}

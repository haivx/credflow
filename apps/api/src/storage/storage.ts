export const STORAGE = Symbol("STORAGE");

/**
 * Nơi lưu file upload. Plan 11 chỉ có LocalStorage; S3 sau này cài đặt cùng interface.
 * `key` do server sinh (vd `documents/<id>.pdf`), không bao giờ lấy từ tên file người dùng.
 */
export interface Storage {
  /** Thư mục ghi file tạm khi đang stream upload. */
  readonly tmpDir: string;
  /** Chuyển file tạm (đã ghi xong, đã hash) vào vị trí `key`. File tạm không còn sau khi gọi. */
  putFromTemp(tmpPath: string, key: string): Promise<void>;
  /** Xoá file ở `key`. Không có file thì bỏ qua. */
  remove(key: string): Promise<void>;
}

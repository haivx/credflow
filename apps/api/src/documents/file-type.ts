/** Loại file nhận khi upload (docs/flows.md F1). */
export interface DetectedFileType {
  mimeType: "application/pdf" | "image/png" | "image/jpeg";
  /** Đuôi dùng trong storageKey. Lấy từ nội dung, không lấy từ tên file người dùng đặt. */
  ext: "pdf" | "png" | "jpg";
}

/** Số byte đầu file cần đọc để nhận dạng (chữ ký dài nhất là PNG, 8 byte). */
export const FILE_TYPE_HEAD_BYTES = 8;

// Magic bytes: vài byte cố định ở đầu mỗi định dạng.
const SIGNATURES: readonly (DetectedFileType & { bytes: readonly number[] })[] =
  [
    // "%PDF-"
    {
      mimeType: "application/pdf",
      ext: "pdf",
      bytes: [0x25, 0x50, 0x44, 0x46, 0x2d],
    },
    {
      mimeType: "image/png",
      ext: "png",
      bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    },
    { mimeType: "image/jpeg", ext: "jpg", bytes: [0xff, 0xd8, 0xff] },
  ];

/**
 * Nhận dạng file bằng magic bytes. Không tin `Content-Type` client gửi: đổi đuôi .txt thành .pdf
 * thì trình duyệt vẫn gửi `application/pdf`. Không khớp loại nào → null.
 */
export function detectFileType(head: Buffer): DetectedFileType | null {
  for (const { bytes, ...type } of SIGNATURES) {
    if (head.length >= bytes.length && bytes.every((b, i) => head[i] === b)) {
      return type;
    }
  }
  return null;
}

import type { DocumentStatus, ErrorCode } from "@credflow/contracts";

/** Nhãn trạng thái cho staff (docs/flows.md F1 bước 3). */
const STATUS_LABEL: Record<DocumentStatus, string> = {
  uploaded: "Đang xử lý",
  processing: "Đang xử lý",
  extracted: "Đang xử lý",
  auto_approved: "Đã tự duyệt",
  needs_review: "Đang chờ duyệt",
  approved: "Đã duyệt",
  rejected: "Bị từ chối",
  reupload_requested: "Cần nộp lại",
  failed: "Không đọc được file, hãy nộp lại",
};

export function statusLabel(status: DocumentStatus): string {
  return STATUS_LABEL[status];
}

/** Còn đang chạy trong pipeline: màn hình tiếp tục hỏi lại trạng thái. */
export function isInProgress(status: DocumentStatus): boolean {
  return (
    status === "uploaded" || status === "processing" || status === "extracted"
  );
}

/** Câu báo lỗi upload theo mã lỗi của API. */
export function uploadErrorMessage(code: ErrorCode, fallback: string): string {
  switch (code) {
    case "PAYLOAD_TOO_LARGE":
      return "File quá lớn: tối đa 10 MB.";
    case "UNSUPPORTED_MEDIA_TYPE":
      return "Chỉ nhận file PDF, PNG hoặc JPEG.";
    case "CONFLICT":
      return "File này đã được một nhân viên khác nộp.";
    case "UNAUTHORIZED":
      return "Phiên đăng nhập đã hết, hãy đăng nhập lại.";
    case "VALIDATION_FAILED":
      return "Thiếu file hoặc dữ liệu không hợp lệ.";
    default:
      return fallback;
  }
}

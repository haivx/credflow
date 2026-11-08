import {
  type DocType,
  type DocumentStatus,
  type DocumentView,
  type ErrorCode,
  GoogleLoginError,
  type RuleCode,
} from "@credflow/contracts";

/** Tên loại giấy cho người đọc (chuyển từ UploadForm ở plan 30, dùng ở nhiều màn). */
export const docTypeLabel: Record<DocType, string> = {
  cpr_card: "Thẻ CPR",
  professional_license: "Giấy phép hành nghề",
  tb_test: "Xét nghiệm TB",
  background_check: "Kiểm tra lý lịch",
  vaccination_record: "Sổ tiêm chủng",
  unknown: "Không nhận ra loại giấy",
};

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

/**
 * Lý do người duyệt ghi, cho staff thấy khi giấy bị từ chối hoặc phải nộp lại (plan 28).
 * Trạng thái khác thì null: note lúc duyệt là ghi chú nội bộ.
 */
export function reviewerReason(doc: DocumentView): string | null {
  if (doc.status !== "rejected" && doc.status !== "reupload_requested") {
    return null;
  }
  return doc.lastReview?.note ?? null;
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
    case "TOO_MANY_REQUESTS":
      return "Bạn đã nộp quá nhiều giấy trong thời gian ngắn, hoặc hệ thống demo đã đủ giấy cho hôm nay. Hãy thử lại sau.";
    default:
      return fallback;
  }
}

/** Câu báo lỗi đăng nhập theo HTTP status (plan 34 thêm 429). */
export function loginErrorText(status: number, message: string): string {
  if (status === 401) return "Sai email hoặc mật khẩu.";
  if (status === 429)
    return "Đăng nhập sai quá nhiều lần. Hãy đợi khoảng 15 phút rồi thử lại.";
  return `Không đăng nhập được: ${message}`;
}

const googleErrorLabel: Record<GoogleLoginError, string> = {
  google_failed: "Không đăng nhập được bằng Google. Hãy thử lại.",
  email_exists:
    "Email này đã có tài khoản đăng nhập bằng mật khẩu. Hãy đăng nhập bằng email và mật khẩu.",
  signup_closed:
    "Bản demo đã nhận đủ tài khoản mới cho hôm nay. Hãy thử lại vào ngày mai.",
};

/** Câu cho `?google_error=<mã>` (plan 36). Mã lạ thì bỏ qua, không hiện chuỗi trên URL. */
export function googleErrorText(code: string | null): string | null {
  const parsed = GoogleLoginError.safeParse(code);
  return parsed.success ? googleErrorLabel[parsed.data] : null;
}

/**
 * Câu tiếng Việt cho staff thay mã rule (plan 30). `Record` bắt buộc đủ mọi `RuleCode`: thêm mã
 * mới ở contracts mà quên câu ở đây thì typecheck lỗi.
 */
export const reasonLabel: Record<RuleCode, string> = {
  WRONG_DOC_TYPE: "Loại giấy không khớp với loại bạn chọn",
  MISSING_FIELD: "Thiếu thông tin trên giấy (vd ngày hết hạn)",
  MISSING_EVIDENCE: "Có thông tin không đọc được rõ trên giấy",
  LOW_CONFIDENCE: "Hệ thống chưa chắc đã đọc đúng, cần người kiểm",
  DATE_INCONSISTENT: "Ngày trên giấy cần người kiểm lại",
  // Rule không qua cả khi thiếu ngày hết hạn (ADR 0009), nên không khẳng định là đã hết hạn.
  EXPIRED: "Giấy đã hết hạn hoặc chưa xác định được ngày hết hạn",
  EXPIRING_SOON: "Giấy sắp hết hạn",
  NAME_MISMATCH: "Tên trên giấy không khớp với hồ sơ của bạn",
  ISSUER_NOT_ACCEPTED:
    "Tổ chức cấp giấy chưa nằm trong danh sách được chấp nhận",
  RESULT_NOT_PASSING: "Kết quả trên giấy chưa đạt",
  NO_RULES_EVALUATED:
    "Hệ thống chưa kiểm tự động được loại giấy này, người duyệt sẽ xem",
};

type StaffReasonInput = Pick<DocumentView, "status" | "routing" | "lastReview">;

/** Lý do hiện cho staff ở danh sách giấy (plan 30). */
export function staffReason(doc: StaffReasonInput): string | null {
  if (doc.status === "rejected" || doc.status === "reupload_requested") {
    return doc.lastReview?.note ?? null;
  }
  // Chỉ giấy đang chờ duyệt mới cần biết vì sao; đã duyệt rồi thì lý do cũ không còn ý nghĩa.
  if (doc.status === "needs_review" && doc.routing !== undefined) {
    const reasons = doc.routing.reasons.map((code) => reasonLabel[code]);
    return reasons.length === 0 ? null : reasons.join("; ");
  }
  return null;
}

export type StatusTone = "success" | "warning" | "info" | "destructive";

/** Màu badge trạng thái (plan 30): biến thể `Badge` trong components/ui/badge.tsx. */
const STATUS_TONE: Record<DocumentStatus, StatusTone> = {
  uploaded: "info",
  processing: "info",
  extracted: "info",
  auto_approved: "success",
  approved: "success",
  needs_review: "warning",
  rejected: "destructive",
  reupload_requested: "destructive",
  failed: "destructive",
};

export function statusTone(status: DocumentStatus): StatusTone {
  return STATUS_TONE[status];
}

/** Hỏi lại mỗi 2 giây khi còn giấy đang xử lý; dừng sau 2 phút (plan 17, giữ ở plan 30). */
export const POLL_INTERVAL_MS = 2_000;
export const POLL_MAX_MS = 120_000;

/**
 * `refetchInterval` cho TanStack Query: số ms tới lần hỏi kế, hoặc `false` để dừng.
 * Hàm thuần: thời điểm bắt đầu và hiện tại do caller đưa vào.
 */
export function pollInterval(
  docs: readonly { status: DocumentStatus }[] | undefined,
  startedAt: number,
  now: number,
): number | false {
  if (docs === undefined || now - startedAt > POLL_MAX_MS) return false;
  return docs.some((d) => isInProgress(d.status)) ? POLL_INTERVAL_MS : false;
}

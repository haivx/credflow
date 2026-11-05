import type { DocumentStatus } from "@credflow/contracts";

/**
 * Bước đi hợp lệ của document. Khai `Record<DocumentStatus, ...>` để compiler báo lỗi khi
 * gõ sai tên trạng thái, hoặc khi contract thêm trạng thái mới mà bảng chưa có.
 */
const TRANSITIONS: Record<DocumentStatus, readonly DocumentStatus[]> = {
  uploaded: ["processing"],
  processing: ["extracted", "needs_review", "failed"],
  extracted: ["auto_approved", "needs_review", "failed"],
  needs_review: ["approved", "rejected", "reupload_requested"],
  auto_approved: [],
  approved: [],
  rejected: [],
  reupload_requested: [],
  failed: [],
};

/** Quyết định của con người: hệ thống không bao giờ tự đi tới các trạng thái này. */
const REVIEWER_ONLY: readonly DocumentStatus[] = [
  "approved",
  "rejected",
  "reupload_requested",
];

export class InvalidTransitionError extends Error {
  constructor(
    readonly from: DocumentStatus,
    readonly to: DocumentStatus,
  ) {
    super(`Không được chuyển trạng thái document: ${from} → ${to}`);
    this.name = "InvalidTransitionError";
  }
}

/** Ném `InvalidTransitionError` nếu bước đi không hợp lệ. Hàm thuần, không đọc DB. */
export function assertTransition(
  from: DocumentStatus,
  to: DocumentStatus,
  actor?: { reviewerId?: string },
): void {
  // Kiểm bảng trước: có reviewerId cũng không mở được cặp ngoài bảng (processing → rejected).
  if (!TRANSITIONS[from].includes(to)) {
    throw new InvalidTransitionError(from, to);
  }
  // Kiểm truthy, không kiểm `!== undefined`: chuỗi rỗng cũng không phải người duyệt.
  if (REVIEWER_ONLY.includes(to) && !actor?.reviewerId) {
    throw new InvalidTransitionError(from, to);
  }
}

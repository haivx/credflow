import type { JobsOptions } from "bullmq";

export const DOCUMENT_QUEUE_NAME = "documents";
export const PROCESS_DOCUMENT_JOB = "process-document";

/** Queue riêng cho sweep: job sweep không có dữ liệu, không đi qua parse `ProcessDocumentJob`. */
export const SWEEP_QUEUE_NAME = "document-sweep";
export const SWEEP_SCHEDULER_ID = "document-sweep";
export const SWEEP_JOB = "sweep";
export const SWEEP_EVERY_MS = 60_000;
/** Plan 34: dọn file quá hạn, chạy trên cùng queue sweep, mỗi giờ một lần. */
export const RETENTION_SCHEDULER_ID = "file-retention";
export const RETENTION_JOB = "file-retention";
export const RETENTION_EVERY_MS = 60 * 60_000;

/**
 * `attempts` tính cả lần chạy đầu: tối đa 3 lần, chờ 1s rồi 2s giữa các lần.
 * Job xong vẫn giữ lại một số lượng có hạn để debug; mặc định BullMQ giữ mãi và Redis đầy dần.
 */
export const DOCUMENT_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: "exponential", delay: 1000 },
  removeOnComplete: { count: 1000 },
  removeOnFail: { count: 5000 },
} satisfies JobsOptions;

export const DOCUMENT_QUEUE = Symbol("DOCUMENT_QUEUE");

/** Phía API chỉ cần đẩy job. Interface để test đè được bản lỗi. */
export interface DocumentQueue {
  enqueue(documentId: string): Promise<void>;
}

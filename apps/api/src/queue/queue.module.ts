import {
  Inject,
  Injectable,
  Logger,
  Module,
  type OnModuleDestroy,
} from "@nestjs/common";
import type { ProcessDocumentJob } from "@credflow/contracts";
import { Queue } from "bullmq";
import type { Redis } from "ioredis";
import { formatErrorForLog } from "../common/pg-error.js";
import { REDIS } from "../redis/redis.provider.js";
import { RedisModule } from "../redis/redis.module.js";
import {
  DOCUMENT_JOB_OPTIONS,
  DOCUMENT_QUEUE,
  DOCUMENT_QUEUE_NAME,
  type DocumentQueue,
  PROCESS_DOCUMENT_JOB,
} from "./document-queue.js";

const ENQUEUE_TIMEOUT_MS = 2000;

@Injectable()
export class BullDocumentQueue implements DocumentQueue, OnModuleDestroy {
  private readonly logger = new Logger("DocumentQueue");
  private readonly queue: Queue<ProcessDocumentJob>;

  // Dùng lại client REDIS: nó đã tắt offline queue, nên Redis chết giữa chừng thì `add` lỗi ngay.
  // Queue chỉ đóng phần của nó; RedisModule đóng client ở onApplicationShutdown, tức là sau bước này.
  constructor(@Inject(REDIS) redis: Redis) {
    this.queue = new Queue(DOCUMENT_QUEUE_NAME, { connection: redis });
    this.queue.on("error", (err: unknown) => {
      const { message, stack } = formatErrorForLog(err);
      this.logger.error(message, stack);
    });
  }

  async enqueue(documentId: string): Promise<void> {
    const add = this.queue.add(
      PROCESS_DOCUMENT_JOB,
      { documentId },
      // jobId = documentId: cùng document thêm hai lần vẫn chỉ có một job.
      { ...DOCUMENT_JOB_OPTIONS, jobId: documentId },
    );
    // Redis chết ngay từ lúc khởi động thì `add` chờ kết nối mãi, offline queue không giúp được.
    // Hết hạn thì upload đi tiếp; `add` có thể vẫn chạy khi Redis sống lại, jobId chặn trùng.
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error("queue.add quá hạn chờ"));
      }, ENQUEUE_TIMEOUT_MS);
    });
    try {
      await Promise.race([add, timeout]);
    } finally {
      clearTimeout(timer);
    }
  }

  /** Job còn cơ hội tự chạy. Trạng thái lạ cũng tính là còn sống: thà chờ vòng sau còn hơn chạy trùng. */
  async hasLiveJob(documentId: string): Promise<boolean> {
    const state = await this.queue.getJobState(documentId);
    return !["completed", "failed", "unknown"].includes(state);
  }

  /**
   * Job completed/failed còn giữ làm `add` cùng `jobId` bị bỏ qua mà không báo lỗi (đã thử thật,
   * plan 13), nên phải xoá trước. Chỉ gọi khi `hasLiveJob` trả false.
   */
  async requeue(documentId: string): Promise<void> {
    await this.queue.remove(documentId);
    await this.enqueue(documentId);
  }

  async onModuleDestroy() {
    await this.queue.close();
  }
}

@Module({
  imports: [RedisModule],
  providers: [
    BullDocumentQueue,
    { provide: DOCUMENT_QUEUE, useExisting: BullDocumentQueue },
  ],
  exports: [DOCUMENT_QUEUE, BullDocumentQueue],
})
export class QueueModule {}

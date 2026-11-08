import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Queue, Worker } from "bullmq";
import { Redis } from "ioredis";
import { formatErrorForLog } from "../common/pg-error.js";
import type { Env } from "../config/env.schema.js";
import {
  DOCUMENT_QUEUE_NAME,
  RETENTION_EVERY_MS,
  RETENTION_JOB,
  RETENTION_SCHEDULER_ID,
  SWEEP_EVERY_MS,
  SWEEP_JOB,
  SWEEP_QUEUE_NAME,
  SWEEP_SCHEDULER_ID,
} from "../queue/document-queue.js";
import { DocumentProcessor } from "./document-processor.js";
import { DocumentSweepService } from "./document-sweep.service.js";
import { FileRetentionService } from "./file-retention.service.js";

/** Số job chạy song song trong một process. Stub chưa có việc nặng; chỉnh lại khi có LLM. */
const CONCURRENCY = 5;

@Injectable()
export class DocumentWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger("DocumentWorker");
  private connection?: Redis;
  private worker?: Worker<unknown>;
  private sweepQueue?: Queue;
  private sweepWorker?: Worker;

  constructor(
    private readonly processor: DocumentProcessor,
    private readonly sweep: DocumentSweepService,
    private readonly retention: FileRetentionService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  onModuleInit() {
    // maxRetriesPerRequest: null là yêu cầu của BullMQ: worker chờ Redis sống lại, không bỏ cuộc.
    this.connection = new Redis(this.config.get("REDIS_URL", { infer: true }), {
      maxRetriesPerRequest: null,
    });
    this.connection.on("error", this.logError);

    this.worker = new Worker<unknown>(
      DOCUMENT_QUEUE_NAME,
      (job) => this.processor.process(job),
      { connection: this.connection, concurrency: CONCURRENCY },
    );
    // Không có listener 'error' thì lỗi kết nối thành lỗi không bắt.
    this.worker.on("error", this.logError);

    this.sweepQueue = new Queue(SWEEP_QUEUE_NAME, {
      connection: this.connection,
    });
    this.sweepQueue.on("error", this.logError);
    // Cùng queue cho hai việc định kỳ, phân theo tên job (plan 34 thêm dọn file).
    this.sweepWorker = new Worker(
      SWEEP_QUEUE_NAME,
      (job) =>
        job.name === RETENTION_JOB ? this.retention.run() : this.sweep.run(),
      {
        connection: this.connection,
        concurrency: 1,
      },
    );
    this.sweepWorker.on("error", this.logError);

    // Đăng ký ở `ready`, không chỉ lúc khởi động: Redis không bật AOF nên restart có thể mất cả lịch,
    // và sweep sẽ im lặng dừng đúng lúc cần nhất. `ready` bắn cả lần đầu lẫn mỗi lần kết nối lại.
    this.connection.on("ready", this.scheduleSweep);
  }

  // worker.close() chờ job đang chạy xong rồi mới đóng. Connection do mình tạo nên mình đóng.
  async onModuleDestroy() {
    this.connection?.off("ready", this.scheduleSweep);
    await Promise.all([this.worker?.close(), this.sweepWorker?.close()]);
    await this.sweepQueue?.close();
    try {
      await this.connection?.quit();
    } catch {
      this.connection?.disconnect();
    }
    this.logger.log("worker đã dừng");
  }

  private readonly scheduleSweep = () => {
    this.sweepQueue
      ?.upsertJobScheduler(
        SWEEP_SCHEDULER_ID,
        { every: SWEEP_EVERY_MS },
        {
          name: SWEEP_JOB,
          opts: {
            removeOnComplete: { count: 10 },
            removeOnFail: { count: 50 },
          },
        },
      )
      .catch(this.logError);
    this.sweepQueue
      ?.upsertJobScheduler(
        RETENTION_SCHEDULER_ID,
        { every: RETENTION_EVERY_MS },
        {
          name: RETENTION_JOB,
          opts: {
            removeOnComplete: { count: 10 },
            removeOnFail: { count: 50 },
          },
        },
      )
      .catch(this.logError);
  };

  private readonly logError = (err: unknown) => {
    const { message, stack } = formatErrorForLog(err);
    this.logger.error(message, stack);
  };
}

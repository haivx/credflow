import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Worker } from "bullmq";
import { Redis } from "ioredis";
import { formatErrorForLog } from "../common/pg-error.js";
import type { Env } from "../config/env.schema.js";
import { DOCUMENT_QUEUE_NAME } from "../queue/document-queue.js";
import { DocumentProcessor } from "./document-processor.js";

/** Số job chạy song song trong một process. Stub chưa có việc nặng; chỉnh lại khi có LLM. */
const CONCURRENCY = 5;

@Injectable()
export class DocumentWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger("DocumentWorker");
  private connection?: Redis;
  private worker?: Worker<unknown>;

  constructor(
    private readonly processor: DocumentProcessor,
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
  }

  // worker.close() chờ job đang chạy xong rồi mới đóng. Connection do mình tạo nên mình đóng.
  async onModuleDestroy() {
    await this.worker?.close();
    try {
      await this.connection?.quit();
    } catch {
      this.connection?.disconnect();
    }
    this.logger.log("worker đã dừng");
  }

  private readonly logError = (err: unknown) => {
    const { message, stack } = formatErrorForLog(err);
    this.logger.error(message, stack);
  };
}

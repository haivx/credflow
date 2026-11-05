import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AppInfoModule } from "./app-info/app-info.module.js";
import { baseConfig } from "./config/config.options.js";
import { DbModule } from "./db/db.module.js";
import { DocumentStatusModule } from "./documents/document-status.module.js";
import { LlmModule } from "./llm/llm.module.js";
import { LlmPipeline } from "./pipeline/llm-pipeline.js";
import { PIPELINE } from "./pipeline/pipeline.js";
import { QueueModule } from "./queue/queue.module.js";
import { rulesConfigProvider } from "./rules/rules-config.provider.js";
import { StorageModule } from "./storage/storage.module.js";
import { DocumentProcessor } from "./worker/document-processor.js";
import { DocumentSweepService } from "./worker/document-sweep.service.js";
import { DocumentWorkerService } from "./worker/document-worker.service.js";

@Module({
  imports: [
    ConfigModule.forRoot(baseConfig),
    AppInfoModule,
    DbModule,
    DocumentStatusModule,
    LlmModule,
    QueueModule,
    StorageModule,
  ],
  providers: [
    rulesConfigProvider,
    { provide: PIPELINE, useClass: LlmPipeline },
    DocumentProcessor,
    DocumentSweepService,
    DocumentWorkerService,
  ],
})
export class WorkerModule {}

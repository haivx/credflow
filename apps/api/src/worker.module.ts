import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AppInfoModule } from "./app-info/app-info.module.js";
import { baseConfig } from "./config/config.options.js";
import { DbModule } from "./db/db.module.js";
import { DocumentStatusModule } from "./documents/document-status.module.js";
import { PIPELINE, StubPipeline } from "./pipeline/pipeline.js";
import { rulesConfigProvider } from "./rules/rules-config.provider.js";
import { DocumentProcessor } from "./worker/document-processor.js";
import { DocumentWorkerService } from "./worker/document-worker.service.js";

@Module({
  imports: [
    ConfigModule.forRoot(baseConfig),
    AppInfoModule,
    DbModule,
    DocumentStatusModule,
  ],
  providers: [
    rulesConfigProvider,
    { provide: PIPELINE, useClass: StubPipeline },
    DocumentProcessor,
    DocumentWorkerService,
  ],
})
export class WorkerModule {}

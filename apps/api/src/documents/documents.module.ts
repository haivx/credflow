import { Module } from "@nestjs/common";
import { DbModule } from "../db/db.module.js";
import { QueueModule } from "../queue/queue.module.js";
import { StorageModule } from "../storage/storage.module.js";
import { DocumentsController } from "./documents.controller.js";
import { DocumentsService } from "./documents.service.js";

@Module({
  imports: [DbModule, StorageModule, QueueModule],
  controllers: [DocumentsController],
  providers: [DocumentsService],
})
export class DocumentsModule {}

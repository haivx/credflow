import { Module } from "@nestjs/common";
import { DbModule } from "../db/db.module.js";
import { DocumentStatusService } from "./document-status.service.js";

@Module({
  imports: [DbModule],
  providers: [DocumentStatusService],
  exports: [DocumentStatusService],
})
export class DocumentStatusModule {}

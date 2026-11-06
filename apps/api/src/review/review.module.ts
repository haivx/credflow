import { Module } from "@nestjs/common";
import { clockProvider } from "../common/clock.js";
import { DbModule } from "../db/db.module.js";
import { DocumentStatusModule } from "../documents/document-status.module.js";
import { rulesConfigProvider } from "../rules/rules-config.provider.js";
import { StorageModule } from "../storage/storage.module.js";
import { ReviewActionsRepository } from "./review-actions.repository.js";
import { ReviewController } from "./review.controller.js";
import { ReviewDecisionService } from "./review-decision.service.js";
import { ReviewReadService } from "./review-read.service.js";

/** Plan 27: API duyệt (hàng chờ, chi tiết, file, preview, quyết định). */
@Module({
  imports: [DbModule, DocumentStatusModule, StorageModule],
  controllers: [ReviewController],
  providers: [
    ReviewReadService,
    ReviewDecisionService,
    ReviewActionsRepository,
    // Preview chấm rule như worker: cùng config, cùng hàm `scoreDocument`.
    rulesConfigProvider,
    clockProvider,
  ],
})
export class ReviewModule {}

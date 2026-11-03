import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller.js";
import { AppInfoModule } from "../app-info/app-info.module.js";
import { DbModule } from "../db/db.module.js";
import { RedisModule } from "../redis/redis.module.js";
import { ReadyController } from "./ready.controller.js";
import { ReadyService } from "./ready.service.js";

@Module({
  imports: [AppInfoModule, DbModule, RedisModule],
  controllers: [HealthController, ReadyController],
  providers: [ReadyService],
})
export class HealthModule {}

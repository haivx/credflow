import { Module } from "@nestjs/common";
import { AppInfoModule } from "./app-info/app-info.module.js";

@Module({
  imports: [AppInfoModule],
})
export class WorkerModule {}

import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AppInfoModule } from "./app-info/app-info.module.js";
import { baseConfig } from "./config/config.options.js";

@Module({
  imports: [ConfigModule.forRoot(baseConfig), AppInfoModule],
})
export class WorkerModule {}

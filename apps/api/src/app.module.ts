import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { HealthModule } from "./health/health.module.js";
import { baseConfig } from "./config/config.options.js";

@Module({
  imports: [ConfigModule.forRoot(baseConfig), HealthModule],
})
export class AppModule {}

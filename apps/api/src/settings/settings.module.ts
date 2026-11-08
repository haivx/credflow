import { Module } from "@nestjs/common";
import { DbModule } from "../db/db.module.js";
import {
  anthropicKeyValidator,
  LLM_KEY_VALIDATOR,
} from "../llm/key-validator.js";
import { LlmSettingsService } from "./llm-settings.service.js";
import { SettingsController } from "./settings.controller.js";

/** Cấu hình LLM (plan 35). API dùng controller; worker chỉ dùng `LlmSettingsService.resolve()`. */
@Module({
  imports: [DbModule],
  providers: [
    LlmSettingsService,
    { provide: LLM_KEY_VALIDATOR, useValue: anthropicKeyValidator },
  ],
  exports: [LlmSettingsService],
})
export class LlmSettingsModule {}

@Module({
  imports: [LlmSettingsModule],
  controllers: [SettingsController],
})
export class SettingsModule {}

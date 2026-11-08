import { Body, Controller, Delete, Get, Put } from "@nestjs/common";
import {
  type AuthUser,
  LlmSettingsView,
  UpdateLlmSettingsRequest,
} from "@credflow/contracts";
import { CurrentUser, Roles } from "../auth/decorators.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { LlmSettingsService } from "./llm-settings.service.js";

/**
 * Cài đặt hệ thống cho admin (plan 35, ADR 0014). Response parse qua `LlmSettingsView` nên dù
 * service lỡ trả thêm field, khoá cũng không ra được ngoài.
 */
@Controller("settings")
@Roles("admin")
export class SettingsController {
  constructor(private readonly settings: LlmSettingsService) {}

  @Get("llm")
  async getLlm() {
    return LlmSettingsView.parse(await this.settings.getView());
  }

  @Put("llm")
  async updateLlm(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(UpdateLlmSettingsRequest))
    body: UpdateLlmSettingsRequest,
  ) {
    return LlmSettingsView.parse(await this.settings.update(user.id, body));
  }

  @Delete("llm/key")
  async clearKey(@CurrentUser() user: AuthUser) {
    return LlmSettingsView.parse(await this.settings.clearKey(user.id));
  }
}

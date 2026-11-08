import { type FactoryProvider, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Anthropic from "@anthropic-ai/sdk";
import type { Env } from "../config/env.schema.js";
import { createHash } from "node:crypto";
import {
  LLM_CLIENT,
  LLM_CLIENT_FACTORY,
  LLM_PROMPTS,
  type LlmClient,
  type LlmClientFactory,
  LlmService,
} from "./llm.service.js";
import { loadAllPrompts, type PromptTexts } from "./prompts.js";

const LLM_TIMEOUT_MS = 60_000;

export const clientProvider = {
  provide: LLM_CLIENT,
  inject: [ConfigService],
  useFactory: (config: ConfigService<Env, true>) => {
    // Env để optional vì process API không gọi LLM; module này chỉ nằm trong worker.
    const apiKey = config.get("ANTHROPIC_API_KEY", { infer: true });
    if (apiKey === undefined) {
      throw new Error("Worker cần ANTHROPIC_API_KEY để gọi LLM");
    }
    // maxRetries 0: BullMQ đã thử 3 lần, để SDK thử thêm thì một document gọi tới 9 lần.
    return new Anthropic({
      apiKey,
      maxRetries: 0,
      timeout: LLM_TIMEOUT_MS,
    });
  },
} satisfies FactoryProvider<Anthropic>;

/**
 * Client theo khoá riêng admin đã lưu (plan 35). Giữ lại theo hash của khoá để không tạo client
 * mới cho mỗi giấy; khoá đổi thì hash đổi, client cũ không còn được dùng. Cùng cấu hình retry/timeout
 * với client hệ thống.
 */
export const clientFactoryProvider = {
  provide: LLM_CLIENT_FACTORY,
  useFactory: (): LlmClientFactory => {
    const clients = new Map<string, LlmClient>();
    return {
      forKey(apiKey) {
        const id = createHash("sha256").update(apiKey).digest("hex");
        let client = clients.get(id);
        if (client === undefined) {
          client = new Anthropic({
            apiKey,
            maxRetries: 0,
            timeout: LLM_TIMEOUT_MS,
          });
          clients.set(id, client);
        }
        return client;
      },
    };
  },
} satisfies FactoryProvider<LlmClientFactory>;

const promptsProvider = {
  provide: LLM_PROMPTS,
  useFactory: () => loadAllPrompts(),
} satisfies FactoryProvider<Promise<PromptTexts>>;

@Module({
  providers: [
    clientProvider,
    clientFactoryProvider,
    promptsProvider,
    LlmService,
  ],
  exports: [LlmService, LLM_CLIENT, LLM_CLIENT_FACTORY],
})
export class LlmModule {}

import { type FactoryProvider, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Anthropic from "@anthropic-ai/sdk";
import type { Env } from "../config/env.schema.js";
import { LLM_CLIENT, LLM_PROMPTS, LlmService } from "./llm.service.js";
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

const promptsProvider = {
  provide: LLM_PROMPTS,
  useFactory: () => loadAllPrompts(),
} satisfies FactoryProvider<Promise<PromptTexts>>;

@Module({
  providers: [clientProvider, promptsProvider, LlmService],
  exports: [LlmService],
})
export class LlmModule {}

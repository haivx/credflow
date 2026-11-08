import { ServiceUnavailableException } from "@nestjs/common";
import Anthropic from "@anthropic-ai/sdk";
import type { LlmModel } from "@credflow/contracts";

export const LLM_KEY_VALIDATOR = Symbol("LLM_KEY_VALIDATOR");

/** "ok": khoá dùng được với model; "invalid": Anthropic từ chối khoá hoặc khoá không có quyền với model. */
export interface LlmKeyValidator {
  validate(apiKey: string, model: LlmModel): Promise<"ok" | "invalid">;
}

const VALIDATE_TIMEOUT_MS = 10_000;

/**
 * Kiểm khoá bằng Models API (`models.retrieve`): không sinh token nên không tốn tiền, nhưng vẫn
 * xác nhận khoá hợp lệ và model dùng được (plan 35). Không chép message của SDK ra ngoài.
 */
export const anthropicKeyValidator: LlmKeyValidator = {
  async validate(apiKey, model) {
    const client = new Anthropic({
      apiKey,
      maxRetries: 0,
      timeout: VALIDATE_TIMEOUT_MS,
    });
    try {
      await client.models.retrieve(model);
      return "ok";
    } catch (err) {
      if (
        err instanceof Anthropic.AuthenticationError ||
        err instanceof Anthropic.PermissionDeniedError ||
        err instanceof Anthropic.NotFoundError
      ) {
        return "invalid";
      }
      throw new ServiceUnavailableException(
        "Không kiểm được khoá với Anthropic lúc này, hãy thử lại sau",
      );
    }
  },
};

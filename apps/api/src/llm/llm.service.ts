import { Inject, Injectable, Logger } from "@nestjs/common";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import {
  Classification,
  CprCardFields,
  DEFAULT_LLM_MODEL,
  type Extraction,
  type LlmModel,
  parseJson,
} from "@credflow/contracts";
import type * as z from "zod";
import type { PromptTexts } from "./prompts.js";

/**
 * Model mặc định (ADR 0008). Model thật của từng giấy do admin cấu hình (plan 35, ADR 0014),
 * trong danh sách `LlmModel` đã qua eval. Eval dùng hằng này.
 */
export const LLM_MODEL: LlmModel = DEFAULT_LLM_MODEL;
/** Client gọi bằng khoá hệ thống (`ANTHROPIC_API_KEY`). */
export const LLM_CLIENT = Symbol("LLM_CLIENT");
/** Tạo client theo khoá riêng admin đã lưu (plan 35). */
export const LLM_CLIENT_FACTORY = Symbol("LLM_CLIENT_FACTORY");

/** Phần của SDK mà module này dùng; test thay bằng bản giả. */
export type LlmClient = Pick<Anthropic, "messages">;

export interface LlmClientFactory {
  forKey(apiKey: string): LlmClient;
}

/** Client và model cho một giấy. Không truyền thì dùng khoá hệ thống + model mặc định. */
export interface LlmRuntime {
  client: LlmClient;
  model: LlmModel;
}
export const LLM_PROMPTS = Symbol("LLM_PROMPTS");

const CLASSIFY_MAX_TOKENS = 1024;
// Thinking tính vào max_tokens, nên phải để dư so với cỡ output.
const EXTRACT_MAX_TOKENS = 4096;
const MAX_CALLS_PER_STEP = 2;

export type LlmStep = "classify" | "extract";
export type CprExtraction = Extract<Extraction, { docType: "cpr_card" }>;

/** Giấy đưa cho LLM. PDF và ảnh đi hai loại block khác nhau. */
export interface LlmDocument {
  documentId: string;
  mimeType: string;
  content: Buffer;
}

/**
 * Lỗi duy nhất ra khỏi module này. Message chỉ có bước và lý do, không chép message của SDK và
 * không gắn `cause`, vì processor log stack và BullMQ lưu stack vào Redis (A14).
 * `retryable = false`: thử lại vô ích, phía gọi chuyển người duyệt ngay.
 */
export class LlmError extends Error {
  constructor(
    readonly step: LlmStep,
    readonly reason: string,
    readonly retryable: boolean,
  ) {
    super(`LLM lỗi ở bước ${step}: ${reason}`);
    this.name = "LlmError";
  }
}

/**
 * LLM chỉ đọc và trích xuất (ADR 0002). Không có tool, chỉ trả dữ liệu. Không import rule,
 * routing hay nơi ghi status (lint A10).
 */
@Injectable()
export class LlmService {
  private readonly logger = new Logger("Llm");

  constructor(
    @Inject(LLM_CLIENT) private readonly client: LlmClient,
    @Inject(LLM_PROMPTS) private readonly prompts: PromptTexts,
  ) {}

  classify(doc: LlmDocument, runtime?: LlmRuntime): Promise<Classification> {
    return this.callStructured(
      "classify",
      Classification,
      this.prompts.classify,
      CLASSIFY_MAX_TOKENS,
      doc,
      runtime,
    );
  }

  async extractCpr(
    doc: LlmDocument,
    runtime?: LlmRuntime,
  ): Promise<CprExtraction> {
    const fields = await this.callStructured(
      "extract",
      CprCardFields,
      this.prompts.extractCpr,
      EXTRACT_MAX_TOKENS,
      doc,
      runtime,
    );
    return { docType: "cpr_card", fields: withoutBoxes(fields) };
  }

  /** Output hỏng thì gọi lại 1 lần ngay tại đây (product.md mục 3); lỗi mạng để BullMQ retry. */
  private async callStructured<S extends z.ZodType>(
    step: LlmStep,
    schema: S,
    system: string,
    maxTokens: number,
    doc: LlmDocument,
    runtime: LlmRuntime | undefined,
  ): Promise<z.output<S>> {
    for (let call = 1; call <= MAX_CALLS_PER_STEP; call++) {
      const text = await this.request(
        step,
        schema,
        system,
        maxTokens,
        doc,
        runtime ?? { client: this.client, model: LLM_MODEL },
      );
      if (text === undefined) continue;
      try {
        return parseJson(schema, text);
      } catch {
        this.logger.warn(
          `document ${doc.documentId} bước ${step}: output sai schema, lượt ${String(call)}`,
        );
      }
    }
    throw new LlmError(step, "output không hợp lệ sau khi gọi lại", false);
  }

  /** Trả text của response; `undefined` khi bị cắt vì max_tokens. */
  private async request<S extends z.ZodType>(
    step: LlmStep,
    schema: S,
    system: string,
    maxTokens: number,
    doc: LlmDocument,
    runtime: LlmRuntime,
  ): Promise<string | undefined> {
    const startedAt = performance.now();
    let response: Anthropic.Message;
    try {
      response = await runtime.client.messages.create({
        model: runtime.model,
        max_tokens: maxTokens,
        system,
        output_config: { effort: "low", format: zodOutputFormat(schema) },
        messages: [
          {
            role: "user",
            content: [
              toContentBlock(doc),
              { type: "text", text: "Process this document." },
            ],
          },
        ],
      });
    } catch (err) {
      throw toLlmError(step, err);
    }

    // Chỉ id, token, thời gian: data policy cấm log nội dung trường.
    this.logger.log(
      `document ${doc.documentId} bước ${step}: input=${String(response.usage.input_tokens)} output=${String(response.usage.output_tokens)} ms=${String(Math.round(performance.now() - startedAt))} stop=${String(response.stop_reason)}`,
    );

    if (response.stop_reason === "refusal") {
      throw new LlmError(step, "model từ chối", false);
    }
    if (response.stop_reason === "max_tokens") return undefined;

    // Đọc theo type: response có thể mở đầu bằng block thinking.
    return response.content
      .flatMap((block) => (block.type === "text" ? [block.text] : []))
      .join("");
  }
}

function toContentBlock(doc: LlmDocument): Anthropic.ContentBlockParam {
  const data = doc.content.toString("base64");
  if (doc.mimeType === "application/pdf") {
    return {
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data },
    };
  }
  if (doc.mimeType === "image/png" || doc.mimeType === "image/jpeg") {
    return {
      type: "image",
      source: { type: "base64", media_type: doc.mimeType, data },
    };
  }
  // Upload đã chặn bằng magic bytes, tới đây là bug. API sẽ từ chối, nên không retry.
  throw new LlmError("classify", "loại file không hỗ trợ", false);
}

/** Lỗi mạng, 408, 409, 429, 5xx đáng thử lại; 4xx còn lại thử bao nhiêu lần cũng vậy. */
function toLlmError(step: LlmStep, err: unknown): LlmError {
  if (err instanceof Anthropic.APIConnectionError) {
    return new LlmError(step, "mất kết nối hoặc quá hạn", true);
  }
  if (err instanceof Anthropic.APIError) {
    // SDK khai `status` là any khi không chỉ định generic.
    const status: unknown = err.status;
    const retryable =
      typeof status === "number" &&
      (status === 408 || status === 409 || status === 429 || status >= 500);
    return new LlmError(step, `API trả ${String(status)}`, retryable);
  }
  return new LlmError(step, "lỗi không xác định", true);
}

/**
 * Bỏ `evidence.box`: Haiku vẫn trả toạ độ dù prompt yêu cầu bỏ, và chưa ai kiểm chúng đúng hay
 * không (plan 14). Giữ lại thì màn duyệt P4 sẽ tô sai chỗ.
 */
function withoutBoxes(
  fields: z.output<typeof CprCardFields>,
): z.output<typeof CprCardFields> {
  return {
    holderName: withoutBox(fields.holderName),
    issuerName: withoutBox(fields.issuerName),
    courseType: withoutBox(fields.courseType),
    completionDate: withoutBox(fields.completionDate),
    expirationDate: withoutBox(fields.expirationDate),
    validityText: withoutBox(fields.validityText),
    cardNumber: withoutBox(fields.cardNumber),
  };
}

function withoutBox<F extends { evidence: { quote: string } | null }>(
  field: F,
): F {
  return {
    ...field,
    evidence: field.evidence === null ? null : { quote: field.evidence.quote },
  };
}

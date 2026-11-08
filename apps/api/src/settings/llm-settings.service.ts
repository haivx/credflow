import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  DEFAULT_LLM_MODEL,
  LlmModel,
  type LlmSettingsView,
  type UpdateLlmSettingsRequest,
} from "@credflow/contracts";
import { eq } from "drizzle-orm";
import type { Env } from "../config/env.schema.js";
import { type Db, DB } from "../db/db.provider.js";
import { appSettings } from "../db/schema.js";
import {
  LLM_KEY_VALIDATOR,
  type LlmKeyValidator,
} from "../llm/key-validator.js";
import { decryptSecret, encryptSecret, parseMasterKey } from "./secret-box.js";

const SETTINGS_ID = "llm";

/** Cấu hình worker dùng cho một giấy. `apiKey` chỉ có khi admin đặt khoá riêng. */
export type ResolvedLlmSettings =
  | { source: "default"; model: LlmModel }
  | { source: "custom"; model: LlmModel; apiKey: string };

/** Khoá riêng đã lưu nhưng không dùng được (thiếu/sai khoá chủ, bản mã hỏng). Message không chứa bí mật. */
export class LlmSettingsError extends Error {
  constructor(reason: string) {
    super(`Cấu hình LLM lỗi: ${reason}`);
    this.name = "LlmSettingsError";
  }
}

/**
 * Cấu hình LLM do admin đặt cho cả hệ thống (plan 35, ADR 0014). Khoá riêng được kiểm với
 * Anthropic rồi mã hoá AES-256-GCM trước khi lưu; API chỉ trả 4 ký tự cuối.
 */
@Injectable()
export class LlmSettingsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(LLM_KEY_VALIDATOR) private readonly validator: LlmKeyValidator,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async getView(): Promise<LlmSettingsView> {
    const row = await this.readRow();
    const custom = row?.apiKeyCiphertext != null;
    return {
      source: custom ? "custom" : "default",
      model: custom ? LlmModel.parse(row.llmModel) : DEFAULT_LLM_MODEL,
      keyLast4: custom ? row.apiKeyLast4 : null,
      allowedModels: [...LlmModel.options],
      encryptionConfigured: this.masterKey() !== undefined,
      updatedAt: row === undefined ? null : row.updatedAt.toISOString(),
    };
  }

  async update(
    userId: string,
    req: UpdateLlmSettingsRequest,
  ): Promise<LlmSettingsView> {
    if (req.apiKey === undefined) {
      const row = await this.readRow();
      if (row?.apiKeyCiphertext == null) {
        if (req.model !== DEFAULT_LLM_MODEL) {
          throw new BadRequestException(
            "Khoá hệ thống chỉ dùng model mặc định; hãy nhập khoá riêng để chọn model khác",
          );
        }
        return this.getView();
      }
      await this.db
        .update(appSettings)
        .set({ llmModel: req.model, updatedBy: userId, updatedAt: new Date() })
        .where(eq(appSettings.id, SETTINGS_ID));
      return this.getView();
    }

    const key = this.masterKey();
    if (key === undefined) {
      throw new BadRequestException(
        "Server chưa cấu hình khoá chủ (SETTINGS_ENCRYPTION_KEY) nên chưa lưu được khoá riêng",
      );
    }
    if ((await this.validator.validate(req.apiKey, req.model)) === "invalid") {
      throw new BadRequestException(
        "Khoá không hợp lệ hoặc không dùng được model đã chọn",
      );
    }
    const values = {
      llmModel: req.model,
      apiKeyCiphertext: encryptSecret(req.apiKey, key),
      apiKeyLast4: req.apiKey.slice(-4),
      updatedBy: userId,
      updatedAt: new Date(),
    };
    await this.db
      .insert(appSettings)
      .values({ id: SETTINGS_ID, ...values })
      .onConflictDoUpdate({ target: appSettings.id, set: values });
    return this.getView();
  }

  async clearKey(userId: string): Promise<LlmSettingsView> {
    const values = {
      llmModel: DEFAULT_LLM_MODEL,
      apiKeyCiphertext: null,
      apiKeyLast4: null,
      updatedBy: userId,
      updatedAt: new Date(),
    };
    await this.db
      .insert(appSettings)
      .values({ id: SETTINGS_ID, ...values })
      .onConflictDoUpdate({ target: appSettings.id, set: values });
    return this.getView();
  }

  /** Model sẽ dùng, để ghi `versions.model` lúc giấy vào `processing`. Không giải mã khoá. */
  async currentModel(): Promise<LlmModel> {
    const row = await this.readRow();
    if (row?.apiKeyCiphertext == null) return DEFAULT_LLM_MODEL;
    const model = LlmModel.safeParse(row.llmModel);
    return model.success ? model.data : DEFAULT_LLM_MODEL;
  }

  /**
   * Worker gọi mỗi giấy. Khoá riêng không giải mã được thì ném lỗi, **không** quay về khoá hệ
   * thống: admin tưởng đang trả bằng khoá riêng thì không được để Liam trả thay.
   */
  async resolve(): Promise<ResolvedLlmSettings> {
    const row = await this.readRow();
    if (row?.apiKeyCiphertext == null) {
      return { source: "default", model: DEFAULT_LLM_MODEL };
    }
    const model = LlmModel.safeParse(row.llmModel);
    if (!model.success) throw new LlmSettingsError("model không còn được phép");
    const key = this.masterKey();
    if (key === undefined) {
      throw new LlmSettingsError("thiếu SETTINGS_ENCRYPTION_KEY");
    }
    try {
      return {
        source: "custom",
        model: model.data,
        apiKey: decryptSecret(row.apiKeyCiphertext, key),
      };
    } catch {
      throw new LlmSettingsError("không giải mã được khoá riêng");
    }
  }

  private async readRow() {
    const [row] = await this.db
      .select()
      .from(appSettings)
      .where(eq(appSettings.id, SETTINGS_ID));
    return row;
  }

  private masterKey(): Buffer | undefined {
    const raw = this.config.get("SETTINGS_ENCRYPTION_KEY", { infer: true });
    return raw === undefined ? undefined : parseMasterKey(raw);
  }
}

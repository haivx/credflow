import * as z from "zod";
import { IsoTimestamp } from "./common.js";

// Plan 35, ADR 0014 (Liam 2026-11-08): admin cấu hình LLM cho cả hệ thống.

/**
 * Model được phép chọn: chỉ model đã qua `make eval` (falseApproveRate = 0 trên dev và holdout).
 * Thêm model = sửa enum này + chạy eval + cập nhật ADR 0014.
 */
export const LlmModel = z.enum(["claude-haiku-5-5"]).meta({ id: "LlmModel" });
export type LlmModel = z.infer<typeof LlmModel>;

/** Model của chế độ mặc định (khoá hệ thống), ADR 0008. */
export const DEFAULT_LLM_MODEL: LlmModel = "claude-haiku-5-5";

/**
 * Cấu hình LLM trả cho admin. Không bao giờ chứa khoá: chỉ 4 ký tự cuối để nhận ra khoá nào.
 * `encryptionConfigured = false`: server thiếu khoá chủ, chưa lưu được khoá riêng.
 */
export const LlmSettingsView = z
  .object({
    source: z.enum(["default", "custom"]),
    model: LlmModel,
    keyLast4: z.string().length(4).nullable(),
    allowedModels: z.array(LlmModel),
    encryptionConfigured: z.boolean(),
    updatedAt: IsoTimestamp.nullable(),
  })
  .meta({ id: "LlmSettingsView" });
export type LlmSettingsView = z.infer<typeof LlmSettingsView>;

/** Khoá Anthropic: `sk-ant-…`, không khoảng trắng (lỗi dán hay gặp, plan 34). */
const AnthropicApiKey = z
  .string()
  .regex(
    /^sk-ant-[A-Za-z0-9_-]{16,}$/,
    "Khoá Anthropic phải dạng sk-ant-…, không có khoảng trắng",
  );

/**
 * PUT /settings/llm. Có `apiKey`: kiểm với Anthropic rồi lưu (mã hoá). Không có: giữ khoá hiện tại,
 * chỉ đổi model. Khoá mặc định chỉ dùng DEFAULT_LLM_MODEL.
 */
export const UpdateLlmSettingsRequest = z
  .strictObject({
    model: LlmModel,
    apiKey: AnthropicApiKey.optional(),
  })
  .meta({ id: "UpdateLlmSettingsRequest" });
export type UpdateLlmSettingsRequest = z.infer<typeof UpdateLlmSettingsRequest>;

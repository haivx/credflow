# 35 · Màn Settings cho admin: khoá Anthropic riêng và chọn model (P6a)

Phase: P6a · Trạng thái: Đã duyệt · Ngày: 2026-11-08

## Context
CredFlow đang gọi Claude bằng khoá của Liam với `claude-haiku-5-5` (hằng `LLM_MODEL`, ADR 0008); đó là "gói free" và đã có trần ở plan 34. Liam muốn tách hai trường hợp: free dùng mặc định; ai cần chính xác hơn thì tự trả bằng khoá riêng và (sau này) chọn model tốt hơn.

Liam chốt 2026-11-08:
- **Admin** đặt cho **cả hệ thống** (vẫn single-tenant, không per-user, không multi-tenant).
- Chỉ cho chọn **model đã qua `make eval`**.
- **Chưa chạy eval model mới** (hạn mức key $5). Danh sách model tạm thời chỉ có `claude-haiku-5-5`; kiến trúc để sẵn chỗ thêm model sau khi eval.

Kết quả: admin mở `/settings`, dán khoá Anthropic riêng, hệ thống kiểm khoá rồi lưu (mã hoá); worker dùng khoá đó cho giấy mới. Xoá khoá thì quay về khoá mặc định. Khoá không bao giờ quay lại trình duyệt hay vào log.

## Bước 0 · Sản phẩm (trước code)
- `docs/product.md`: bảng quyết định dòng LLM: "mặc định Haiku 5.5 + khoá hệ thống; admin đặt khoá riêng và chọn model trong danh sách đã qua eval"; mục người dùng: admin cấu hình LLM.
- `docs/decisions/0014-cau-hinh-llm-boi-admin.md`: khoá riêng mã hoá AES-256-GCM, danh sách model là enum trong contract chỉ mở rộng sau eval, không bật `fallbacks` (fallback sang model chưa eval vi phạm danh sách), trần plan 34 áp cho mọi chế độ. Bổ sung (không thay) ADR 0008.

## Phạm vi
- Trong:
  1. **Contract** (`packages/contracts/src/settings.ts`): `LlmModel = z.enum(["claude-haiku-5-5"])`, `DEFAULT_LLM_MODEL`; `LlmSettingsView { source: "default" | "custom", model, keyLast4: string | null, allowedModels, updatedAt: string | null }`; `UpdateLlmSettingsRequest { model, apiKey?: string }` (apiKey: chuỗi `sk-ant-…`, không khoảng trắng, độ dài hợp lý).
  2. **DB**: bảng `app_settings` (một dòng, `id = 'llm'`, CHECK): `llm_model`, `api_key_ciphertext` (null = mặc định), `api_key_last4`, `updated_by` (FK `users`), `updated_at`. Migration 0008.
  3. **Mã hoá** (`apps/api/src/settings/secret-box.ts`): AES-256-GCM (`node:crypto`), khoá chủ `SETTINGS_ENCRYPTION_KEY` (base64, 32 byte; env tuỳ chọn, thiếu thì không lưu được khoá riêng, báo rõ). Định dạng `v1:<iv>:<tag>:<ciphertext>`.
  4. **API** (vai trò `admin`; staff/reviewer → 403):
     - `GET /settings/llm` → `LlmSettingsView`.
     - `PUT /settings/llm` → kiểm model trong danh sách; có `apiKey` thì gọi `models.retrieve(model)` bằng khoá đó (không tốn token) → 401/403 từ Anthropic thành `400 VALIDATION_FAILED` "Khoá không hợp lệ"; hợp lệ thì mã hoá và lưu, chỉ giữ 4 ký tự cuối để hiện. Không có `apiKey` thì giữ khoá cũ, chỉ đổi model (khoá mặc định chỉ dùng `DEFAULT_LLM_MODEL`).
     - `DELETE /settings/llm/key` → về mặc định.
     - Bộ kiểm khoá là provider tiêm được (`LLM_KEY_VALIDATOR`), test thay bằng bản giả.
  5. **Worker**: `LlmSettingsService.resolve()` đọc `app_settings` mỗi giấy (một query nhỏ) → client Anthropic theo khoá (cache theo hash khoá, không giữ khoá rõ trong log) + model. `LlmService` nhận `{ client, model }` theo từng giấy thay vì hằng; `versions.model` ghi model thật đã dùng. Giải mã lỗi (thiếu/sai `SETTINGS_ENCRYPTION_KEY`) → lỗi không thử lại → giấy chuyển người duyệt với `error.step`, **không** lặng lẽ quay về khoá của Liam.
  6. **Web**: trang `/settings` (admin; trang chủ của admin chuyển tới đây thay câu "làm ở P5"): card "Mô hình AI": nguồn khoá (Mặc định của hệ thống / Khoá riêng ••••abcd), chọn model (`<select>` từ `allowedModels`), ô dán khoá (`type=password`), nút "Kiểm tra và lưu", "Dùng lại khoá mặc định"; câu giải thích chi phí; toast. Header admin có link "Cài đặt".
- Ngoài: chạy eval Sonnet 5.5 / Opus 5.5 (plan sau, khi có credit); `fallbacks`; per-user/multi-tenant; nới trần plan 34 cho khoá riêng; xoay khoá chủ.

## Thay đổi
| File | Thay đổi |
| --- | --- |
| `packages/contracts/src/settings.ts` (+ index, test) | schema mới |
| `apps/api/src/db/schema.ts`, `apps/api/drizzle/0008_*.sql` | bảng `app_settings` |
| `apps/api/src/config/env.schema.ts` (+ spec) | `SETTINGS_ENCRYPTION_KEY` (tuỳ chọn, kiểm 32 byte) |
| `apps/api/src/settings/*` (mới) | `secret-box.ts` (+ spec), `llm-settings.service.ts`, `settings.controller.ts`, `key-validator.ts`, `settings.module.ts` |
| `apps/api/src/llm/llm.module.ts`, `llm.service.ts` | client/model theo từng giấy; bỏ provider client cố định |
| `apps/api/src/pipeline/*`, `worker/document-processor.ts` | truyền model thật vào `versions.model` |
| `apps/api/scripts/eval.ts` | dùng `DEFAULT_LLM_MODEL` (eval vẫn chạy Haiku, không đổi hành vi) |
| `apps/api/test/settings.int-spec.ts`, `llm-settings.int-spec.ts` (mới) | xem Verification |
| `apps/web/app/settings/page.tsx`, `_components/SettingsScreen.tsx`, `_lib/queries.ts`, `page.tsx`, `AppShell.tsx` | màn Settings |
| `.env.example`, `.claude/skills/verify/FEATURE_MAP.md`, `docs/product.md`, `docs/decisions/0014-*.md` | biến mới, tài liệu |

## Vùng kiến trúc bị chạm
- `packages/contracts/src/**`
- `apps/api/src/db/schema.ts`
- `apps/api/drizzle/**`
- `.claude/skills/verify/**`

## Contract / config / prompt bị ảnh hưởng
- **Contract:** thêm `LlmModel`, `LlmSettingsView`, `UpdateLlmSettingsRequest` (chỉ thêm).
- **Schema DB:** bảng mới `app_settings` (migration 0008, không đụng bảng cũ).
- **Model:** không đổi (vẫn Haiku 5.5). Đường code đổi từ hằng sang cấu hình; `versions.model` vẫn ra `claude-haiku-5-5`, nên `make eval-ci` phải giữ 0/44 không đổi.
- Không đổi prompt, rule.

## Quyết định đáng nhớ
- Chỗ khó nhất: giữ khoá của khách an toàn qua 3 chặng (trình duyệt → API → DB → worker). Mã hoá khi lưu bằng khoá chủ ở env; API chỉ trả 4 ký tự cuối; log chỉ ghi "khoá riêng/mặc định", không ghi khoá hay hash đầy đủ.
- Danh sách model là enum trong contract chứ không phải chuỗi tuỳ ý: thêm model = sửa contract + chạy eval + ADR, đúng nguyên tắc "đổi model phải qua eval". Không bật `fallbacks` của API vì nó có thể chạy model chưa eval.
- Giải mã lỗi thì chuyển người duyệt chứ không quay về khoá của Liam: tránh việc admin tưởng đang trả bằng khoá riêng mà thật ra Liam trả.
- Hỏng khi: đổi/mất `SETTINGS_ENCRYPTION_KEY` → khoá đã lưu thành vô dụng, admin phải dán lại (đã ghi trong ADR; xoay khoá chủ là việc sau). Chạy nhiều replica worker vẫn đúng vì đọc DB mỗi giấy.
- Mức middle: AES-GCM từ `node:crypto`, một bảng settings một dòng. Ghi "Học nâng cao": KMS/secret manager, xoay khoá chủ, mã hoá theo envelope.

## Tiêu chí xong
- [ ] Admin dán khoá thật → lưu được, màn hiện ••••last4; khoá sai → báo "Khoá không hợp lệ", không lưu.
- [ ] Giấy mới chạy bằng khoá riêng (log worker ghi nguồn khoá "riêng"), `versions.model` đúng; xoá khoá → giấy sau chạy bằng khoá mặc định.
- [ ] DB chỉ có ciphertext (không thấy `sk-ant` trong `app_settings`); response API không bao giờ chứa khoá; log không chứa khoá.
- [ ] Staff/reviewer gọi API settings → 403; không thấy link Cài đặt.
- [ ] `make lint`, `make typecheck`, `make test`, `make test-int`, `make eval-ci` (0/44, không đổi) xanh.
- [ ] Evidence report; sau merge Liam thêm `SETTINGS_ENCRYPTION_KEY` (shared variable) cho `api` + `worker` trên Railway.

## Rủi ro / câu hỏi
- Kiểm khoá bằng `models.retrieve` cần mạng tới Anthropic; mất mạng → 502 rõ ràng, không lưu.
- Railway: quên đặt `SETTINGS_ENCRYPTION_KEY` thì màn Settings báo "chưa cấu hình khoá chủ", chế độ mặc định vẫn chạy.
- Code ở worktree `../credflow-35` (nhánh `feat/35-settings-llm` từ `main`), `COMPOSE_PROJECT_NAME=credflow`.

## Verification plan

**Mức rủi ro:** T2. Thêm đường cấu hình khoá/model cho LLM; model thực tế không đổi; không đổi rule, routing, đường ra quyết định. Có lưu bí mật nên kiểm kỹ phần không lộ khoá.

**Hành vi kỳ vọng (theo cách người dùng nói):**
- Admin vào Cài đặt, dán khoá Anthropic của mình, bấm "Kiểm tra và lưu" → thấy "Khoá riêng ••••abcd"; giấy nộp sau đó tính tiền vào khoá đó.
- Dán khoá sai → báo khoá không hợp lệ, cấu hình cũ giữ nguyên.
- Bấm "Dùng lại khoá mặc định" → quay về khoá hệ thống.
- Staff và reviewer không vào được trang này.

**Các mức kiểm:**
- [ ] L0: `make lint`, `make typecheck`.
- [ ] L1 (`make test`): `secret-box` (khứ hồi, sửa 1 byte → lỗi, sai khoá chủ → lỗi, mỗi lần mã hoá ra chuỗi khác); contract settings; env `SETTINGS_ENCRYPTION_KEY` sai độ dài → lỗi.
- [ ] L2 (`make test-int`): `settings.int-spec.ts` (GET mặc định; PUT khoá hợp lệ với validator giả → `source: custom`, `keyLast4`, DB không có chuỗi khoá; PUT khoá bị validator từ chối → 400, DB không đổi; model ngoài danh sách → 400; DELETE → mặc định; staff/reviewer → 403; response không bao giờ có field khoá); `llm-settings.int-spec.ts` (resolve mặc định/riêng; ciphertext hỏng → lỗi không thử lại).
- [ ] L2 thật: `up.sh` với `SETTINGS_ENCRYPTION_KEY`; `api.sh --as admin` PUT khoá **sai** → 400 (lượt `models.retrieve` không tốn token); PUT khoá thật của Liam (lấy từ `.env`, không in ra) → 200; upload thẻ → tự duyệt, log worker "khoá riêng", `versions.model = claude-haiku-5-5`; `psql` `app_settings` không chứa `sk-ant`; `grep sk-ant .verify/logs/*` rỗng; DELETE → giấy sau log "khoá mặc định".
- [ ] L2 Eval: `make eval-ci` 0/44 (không đổi).
- [ ] L3: `ui.mts --login admin@example.test`: trang Cài đặt, screenshot trước/sau khi lưu; reviewer mở `/settings` → `wrong-role`.
- [ ] L4: không.

**Kịch bản sẽ chạy:**
| # | Kịch bản | Input | Kết quả kỳ vọng |
|---|---|---|---|
| 1 | mặc định | admin mở `/settings` | "Mặc định của hệ thống", model Haiku 5.5 |
| 2 | khoá sai | dán `sk-ant-sai…` | "Khoá không hợp lệ", cấu hình không đổi |
| 3 | khoá thật | khoá của Liam | ••••last4; upload → worker log "khoá riêng", tự duyệt |
| 4 | không lộ khoá | psql, log, response | không có chuỗi khoá ở đâu ngoài ciphertext |
| 5 | về mặc định | "Dùng lại khoá mặc định" | giấy sau log "khoá mặc định" |
| 6 | sai vai trò | reviewer `/settings`, API 403 | không vào được |
| 7 | thiếu khoá chủ | bỏ `SETTINGS_ENCRYPTION_KEY`, PUT khoá | 400/503 với câu "chưa cấu hình khoá chủ"; chế độ mặc định vẫn chạy |

**Test mới phải đỏ trên code cũ:** mỗi spec mới chạy trước khi có module → đỏ; `secret-box` ca "sửa 1 byte" đỏ nếu bỏ kiểm auth tag; settings ca "response không có khoá" đỏ nếu trả cả bản ghi.

**Thay đổi feature map:** mục mới "Cài đặt LLM (admin)".

**Những gì sẽ KHÔNG kiểm, và lý do:**
- Model ngoài Haiku 5.5: chưa có trong danh sách (chưa eval).
- Railway thật: Liam kiểm sau merge (thêm `SETTINGS_ENCRYPTION_KEY`).

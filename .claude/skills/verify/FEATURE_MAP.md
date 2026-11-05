# Feature Map

> Cách tới từng tính năng: từ phía người dùng (đường dẫn UI), phía API, và phía dữ liệu.
> Agent dùng file này để biến một báo lỗi mơ hồ ("upload hỏng rồi", một screenshot ghi "???")
> thành một bước tái hiện cụ thể. Giữ nó luôn mới: map cũ còn tệ hơn không có map.
>
> Lấy từ code CredFlow ngày 2026-11-04 (sau plan 11). Chỗ chưa chắc hoặc chưa làm ghi `TODO(verify)`.

## Quy ước
- API chạy ở `http://127.0.0.1:8787` (`make dev-api`), **không có tiền tố `/api`**. Web (P1 sau)
  sẽ proxy `/api/*` sang API bằng Next `rewrites` (ADR 0004).
- Selector UI dùng `data-testid`. Phần tử cần dùng mà chưa có thì thêm trong cùng thay đổi.
- Đường dẫn dùng `:param` cho phần động.
- Lỗi API luôn có dạng `ApiError { code, message, details? }` (`packages/contracts/src/error.ts`).
- "Kỳ vọng" mô tả kết quả quan sát được mà người dùng quan tâm.

## User seed (`make db-seed`, mật khẩu dev `credflow-dev`)
| Email | Vai trò | Ghi chú |
|---|---|---|
| `staff@example.test` | `staff` | gắn với staff `01M6CRWH00M3S97971WJSR6NWZ` |
| `reviewer@example.test` | `reviewer` | |
| `admin@example.test` | `admin` | |

Cộng 10 hồ sơ staff giả lập (`apps/api/scripts/seed-data.ts`). Integration test tự tạo user bằng
`apps/api/test/auth.ts` (`loginAs`).

---

## Health / readiness
- **API:** `GET /health` → `200 { status: "ok", ... }` (process còn sống, không kiểm phụ thuộc)
- **API:** `GET /ready` → `200 { status: "ok", checks: { db: "up", redis: "up" } }`; phụ thuộc hỏng → `503`
- **Public:** có (`@Public()`)
- **Dùng bởi:** readiness check của `scripts/up.sh` (`TODO(verify)`: script chưa có)

## Đăng nhập (plan 10, ADR 0004)
- **API:**
  - `POST /auth/login` body `{ email, password }` → `200 AuthUser` + cookie `credflow_session` (httpOnly, SameSite=Lax)
  - `GET /auth/me` → `200 AuthUser`; không có cookie / hết hạn → `401 UNAUTHORIZED`
  - `POST /auth/logout` → `204`, cookie cũ dùng lại → `401`
- **Kỳ vọng:** sai email hoặc sai mật khẩu cùng một câu `401`; route không `@Public()` mà chưa login → `401`; sai vai trò → `403 FORBIDDEN`
- **UI:** `TODO(verify)`: màn login gộp với màn upload, chưa làm
- **Mức rủi ro:** T3 (auth)

## Hồ sơ staff
- **API:** `GET /staff?role=&region=` (sắp theo tên), `GET /staff/:id` (không có → `404 NOT_FOUND`)
- **Vai trò:** `reviewer`, `admin`; `staff` → `403`
- **Kỳ vọng:** 10 staff seed hiện ra

## Upload giấy (plan 11, ADR 0005)
- **API:** `POST /documents` (multipart: field `file`, tuỳ chọn `declaredDocType` ∈ `DocType`)
- **Vai trò:** chỉ `staff`; `staffId` lấy từ session
- **Kỳ vọng:**
  - file mới → `201 { documentId, status: "uploaded", duplicate: false }`, một dòng `documents`, file ở `data/files/documents/<id>.<ext>`
  - cùng staff gửi lại cùng file (cùng sha256) → `200 { duplicate: true }`, cùng `documentId`
  - file đã thuộc staff khác → `409 CONFLICT`
  - quá `UPLOAD_MAX_BYTES` (10 MB) → `413 PAYLOAD_TOO_LARGE`; không phải PDF/PNG/JPEG (magic bytes) → `415 UNSUPPORTED_MEDIA_TYPE`; file rỗng / thiếu field / 2 file / field lạ → `400`
  - không bao giờ còn file trong `data/tmp/` sau request
- **Kiểm sẵn có:** `apps/api/test/documents.int-spec.ts` (14 case)
- **UI:** `TODO(verify)`: màn upload S1 chưa làm

## Pipeline xử lý (P1, đã có LLM, rule chưa nối)
- **Rule engine (plan 15, ADR 0009):** `evaluateRules` chấm 9 rule cho `cpr_card` nhưng **chưa nối vào pipeline**. Kiểm: `pnpm --filter @credflow/rules test`; `recorded.test.ts` chạy trên output thật của Haiku (`eval/hard-cases/cpr/recorded/`)
- **Trạng thái:** `uploaded → processing → extracted → auto_approved | needs_review | failed`; sau duyệt: `approved | rejected | reupload_requested` (`DocumentStatus`)
- **Hiện tại (plan 14):** upload đẩy job (`jobId = documentId`), worker gọi Claude thật (`claude-haiku-5-5`, ADR 0008): phân loại mọi file, trích xuất chỉ khi `cpr_card`. Chưa có rule nên mọi document đi `uploaded → processing → needs_review`, `routing.reasons = ["NO_RULES_EVALUATED"]`, `versions = { pipeline: "14", prompt: "classify@1+extract-cpr@1", model: "claude-haiku-5-5", rules: "1" }`. `evidence.box` bị bỏ trong code
- **Chạy:** `make dev-api` + `make dev-worker` (worker cần `ANTHROPIC_API_KEY`, **tốn tiền thật**). Không có endpoint đọc trạng thái, xem bằng `psql`. Log worker có token từng lượt để cộng chi phí
- **Fixture:** `eval/hard-cases/cpr/` (5 giấy SAMPLE, nguồn HTML, `expected.json` các trường chính)
- **Lỗi (ADR 0006):**
  - timeout, mất kết nối, 408, 409, 429, 5xx: thử tối đa 3 lần (chờ 1s, 2s), hết lượt → `needs_review`, `error.step = "pipeline"`
  - 4xx khác, `refusal`: 1 lượt, `needs_review`, `error.step` là `classify` hoặc `extract`, giữ phần đã đọc được
  - output sai schema, `max_tokens`: gọi lại 1 lần trong bước đó, vẫn lỗi thì như trên
  - file không có trong storage → `failed`, 0 lượt gọi LLM; job data sai schema → failed set của BullMQ
- **Redis chết:** upload vẫn `201` (tối đa khoảng 2s), document nằm ở `uploaded`; Redis sống lại thì sweep đẩy lại job
- **Sweep (ADR 0007):** chạy trong worker, 60 giây một vòng, queue `document-sweep`, đăng ký lại lịch mỗi khi kết nối Redis `ready`
  - job còn sống (`waiting`, `active`, `delayed`...) → bỏ qua
  - `uploaded` quá 1 phút → xoá job completed/failed còn giữ rồi `add` lại (`add` trùng `jobId` bị bỏ qua mà không báo lỗi)
  - `processing` quá 15 phút → `needs_review`, `reasons = ["NO_RULES_EVALUATED"]`, `error.step = "sweep"`, không chạy lại
- **Chạy trùng job:** chỉ một lần ghi thắng (`WHERE status = from`); job thua nhận conflict, log `warn`, `completed`, không retry
- **Kiểm sẵn có:** `apps/api/test/worker.int-spec.ts`, `apps/api/test/documents-enqueue.int-spec.ts`, `apps/api/test/sweep.int-spec.ts`, `apps/api/test/pipeline.int-spec.ts` (client LLM giả, không tốn tiền)
- **Kỳ vọng (khi có rule thật):**
  - thẻ CPR hợp lệ → `auto_approved`, có `holderName`, `issuerName`, `expirationDate` kèm `evidence.quote`
  - thẻ CPR hết hạn → `needs_review`, `routing.reasons` có `EXPIRED` (không bao giờ tự từ chối)
  - engine không chấm rule nào → `needs_review`, `routing.reasons` = `["NO_RULES_EVALUATED"]`
  - bộ rule thiếu rule `block` cho loại giấy được yêu cầu, hoặc mã trùng → worker không khởi động (`assertRulesReady`, `apps/api/src/rules/rules-config.provider.ts`)
  - file hỏng → `failed` kèm `error.step`; lỗi LLM sau retry → `needs_review`
  - mỗi document có `versions { pipeline, prompt, model, rules }` và `timingMs`
  - ghi trạng thái thiếu dữ liệu (failed không error, auto_approved có rule block trượt…) → DB từ chối 23514 → 500 `INTERNAL`, log có tên constraint (CHECK plan 12d, `test/db-constraints.int-spec.ts`)
  - log lỗi DB chỉ có `PgErrorInfo` + SQL `$1` + frame, không có giá trị của dòng (A14, `test/error-log.int-spec.ts`)
- **Fixture:** `TODO(verify)`: giấy giả lập SAMPLE từ `tools/synth/`, ca khó ở `eval/hard-cases/`
- **Golden kỳ vọng:** `TODO(verify)`: `make eval` (P2)
- **Mức rủi ro:** T3 khi đổi prompt / model / rule / ngưỡng

## Hàng chờ duyệt (P4, chưa làm)
- **UI:** `TODO(verify)`: S2 hàng chờ, S3 màn duyệt (`docs/flows.md` F3)
- **API:** `TODO(verify)`
- **Kỳ vọng:** chỉ document `needs_review`; quyết định ghi `review_actions` (kèm `corrections`), `reviewerId` là user thật

## Dashboard compliance, cấu hình rule (P5, chưa làm)
- **UI:** `TODO(verify)`: S4, S5 (`docs/flows.md` F4, F0)

---

## Chưa map / TODO
- `apps/web`: chưa có màn nào, chưa có `data-testid`.

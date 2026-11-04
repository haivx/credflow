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

## Pipeline xử lý (P1, chưa làm)
- **Trạng thái:** `uploaded → processing → extracted → auto_approved | needs_review | failed`; sau duyệt: `approved | rejected | reupload_requested` (`DocumentStatus`)
- **Hiện tại:** document dừng ở `uploaded`, chưa có queue/worker (`TODO(verify)`: plan 12 BullMQ)
- **Kỳ vọng (khi có):**
  - thẻ CPR hợp lệ → `auto_approved`, có `holderName`, `issuerName`, `expirationDate` kèm `evidence.quote`
  - thẻ CPR hết hạn → `needs_review`, `routing.reasons` có `EXPIRED` (không bao giờ tự từ chối)
  - file hỏng → `failed` kèm `error.step`; lỗi LLM sau retry → `needs_review`
  - mỗi document có `versions { pipeline, prompt, model, rules }` và `timingMs`
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
- Worker (`apps/api/src/worker.ts`): chưa có job nào.
- `apps/web`: chưa có màn nào, chưa có `data-testid`.

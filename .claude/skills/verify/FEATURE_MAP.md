# Feature Map

> Cách tới từng tính năng: từ phía người dùng (đường dẫn UI), phía API, và phía dữ liệu.
> Agent dùng file này để biến một báo lỗi mơ hồ ("upload hỏng rồi", một screenshot ghi "???")
> thành một bước tái hiện cụ thể. Giữ nó luôn mới: map cũ còn tệ hơn không có map.
>
> Lấy từ code CredFlow ngày 2026-11-04 (sau plan 11), cập nhật tới plan 28. Chỗ chưa chắc hoặc chưa làm ghi `TODO(verify)`.
> Bật/tắt app, gọi API, chụp UI: dùng script trong `scripts/` (xem SKILL.md).

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
- **UI:** `http://localhost:3000/` (plan 17): form login (`data-testid=login-form`), header có user và nút `logout`. Reviewer, admin đăng nhập chỉ thấy `role-not-ready`
- **Mức rủi ro:** T3 (auth)

## Hồ sơ staff
- **API:** `GET /staff?role=&region=` (sắp theo tên), `GET /staff/:id` (không có → `404 NOT_FOUND`)
- **Vai trò:** `reviewer`, `admin`; `staff` → `403`
- **Kỳ vọng:** 13 staff seed hiện ra (3 chủ thẻ fixture CPR thêm ở plan 16)

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
- **Nơi lưu file (plan 33):** `STORAGE_DRIVER=local` (mặc định, `DATA_DIR/files`) hoặc `s3` (`S3Storage`, Railway Bucket trên production). Bộ ca dùng chung `apps/api/test/storage-contract.ts` chạy trên `LocalStorage` (unit) và `S3Storage` + s3mock (`s3-storage.int-spec.ts`, service `s3-test` cổng 9090, bucket `credflow-test`). Chạy app với s3 cục bộ: `STORAGE_DRIVER=s3 S3_BUCKET=credflow-test S3_ENDPOINT=http://127.0.0.1:9090 S3_ACCESS_KEY_ID=k S3_SECRET_ACCESS_KEY=s S3_FORCE_PATH_STYLE=true up.sh`. Thiếu biến S3 → API không khởi động, lỗi nêu tên biến
- **Worktree:** chạy `make test-int`, `up.sh` trong worktree thì đặt `COMPOSE_PROJECT_NAME=credflow` để dùng chung container, không tranh cổng
- **UI (S1, plan 17; giao diện plan 30):** `http://localhost:3000/` sau khi login staff: `upload-form` (vùng kéo thả là `<label>` bọc `upload-file` ẩn kiểu `sr-only`; nộp bằng UI: `ui.mts --step upload:upload-file=<file> --step click:upload-submit`), `upload-doc-type` (`<select>` gốc), `upload-submit`, câu báo ở `upload-message` (trùng → "đã nộp file này rồi", 413, 415, 409 có câu riêng) + toast. Danh sách `documents-table` (một DOM: thẻ trên điện thoại, lưới từ `md`), hàng `document-row-<id>` là nút mở chi tiết, `document-status` (badge màu theo `statusTone`), `document-reason` (`staffReason`: từ chối / nộp lại → note người duyệt; chờ duyệt → câu tiếng Việt `reasonLabel`; trạng thái khác → trống). Chi tiết `document-detail`: `detail-status`, `detail-reviewer-reason`, `detail-classification`, `detail-routing`, `detail-as-of`, `detail-fields`; `detail-rules` (`rule-<CODE>`) nằm trong `<details>` "Chi tiết kỹ thuật" (đóng sẵn, chữ không hiện cho `wait:`). Polling 2 s bằng `refetchInterval` (TanStack Query) khi còn giấy đang xử lý, dừng sau 2 phút. Web gọi API qua rewrite `/api/*` → `API_URL` (mặc định `http://127.0.0.1:8787`), cookie cùng site
- **Màn đăng nhập (plan 30):** `site-intro` (giới thiệu CredFlow + 3 bước, ghi chú dữ liệu giả lập) phía trên `login-form`
- **Giao diện chung (plan 30):** Tailwind 3 + shadcn/ui (`apps/web/components/ui`, ADR 0012), header `current-user` (email ẩn ở điện thoại, badge vai trò tiếng Việt), `logout`. Điện thoại: `ui.mts --viewport 390x844`, JSON có `scrollWidth` (≤ rộng viewport = không cuộn ngang). S2/S3 tạm bọc `data-legacy` (style nền trong `app/globals.css`) tới plan 31

## Compliance staff (plan 26)
- **API:** `GET /staff/:id/compliance` → `200 StaffCompliance` (`status` complete / incomplete / unknown_role, `required`, `present`, `missing`, `configs`)
- **Vai trò:** `reviewer`, `admin`; `staff` → `403`; id không có → `404`
- **Kỳ vọng:** chỉ tính giấy `auto_approved`/`approved` (chưa xét hạn); `required` = hợp `roles[role].required` của config mọi khách hàng của staff
- **Chạy:** `up.sh` → `api.sh --as staff-marisol@example.test POST /documents @eval/hard-cases/cpr/01-expires.png` → chờ tự duyệt → `api.sh --as reviewer@example.test GET /staff/01M6CRWH00M3S97971WJSR6NXB/compliance` → `present` [cpr_card], `configs` [sunrise]
- **Index:** `documents_staff_id_idx`, `documents_staff_approved_doctype_idx` (partial); `EXPLAIN` trong `apps/api/test/compliance.int-spec.ts` (20k dòng)

## Đọc giấy của tôi (plan 17)
- **API:** `GET /documents` → `200 DocumentList` (giấy của staff đang login, mới nhất trước, tối đa 50); `GET /documents/:id` → `200 DocumentView`
- **Vai trò:** chỉ `staff`; chưa login → `401`; reviewer, admin → `403`; giấy người khác hoặc id không có → cùng `404 NOT_FOUND` "Không tìm thấy giấy"
- **Kỳ vọng:** response không có `storageKey`, `checksum` (contract `DocumentView`); `lastReview {action, note?, decidedAt}` khi đã có người duyệt (plan 28), không có `reviewerId`
- **UI:** bảng `documents-table` (nhãn trạng thái, lý do; `document-reason` là ghi chú người duyệt khi bị từ chối / phải nộp lại, `detail-reviewer-reason` trong chi tiết), nút "Xem kết quả" mở `document-detail` (classification, routing, `asOf`, versions, timingMs, bảng `detail-fields` có `quote`, bảng `detail-rules`). Trạng thái tự cập nhật: polling 2 giây khi còn giấy đang xử lý, dừng sau 2 phút
- **Chạy:** `make dev` (API + worker + web), login `staff-marisol@example.test` / `credflow-dev`, nộp `eval/hard-cases/cpr/01-expires.png` → "Đang xử lý" rồi "Đã tự duyệt". Lỗi console lúc chưa login: `favicon.ico` 404 và `/api/auth/me` 401 (2 lần do StrictMode dev) là bình thường
- **Kiểm sẵn có:** `apps/api/test/documents-read.int-spec.ts` (8 case)
- **Mức rủi ro:** T2 (phân quyền đọc: kiểm như T3)

## Pipeline xử lý (P1, LLM + rule CPR, plan 16)
- **Rule engine (plan 15, ADR 0009):** `evaluateRules` chấm 9 rule cho `cpr_card`. **Config theo khách hàng (plan 25, ADR 0011):** `config/rules/default.yaml` + `clients/<clientId>.yaml` (Sunrise `MDY`, Bayleaf chấp nhận thêm Harrowgate); chấm theo mọi khách của staff, lấy chặt nhất; `versions.rules` như `sunrise@1`, `bayleaf@1+sunrise@1`. Kiểm nhanh: upload `11-mdy-date.png` bằng `staff@example.test` (Maren, Sunrise) → `auto_approved`. `DATE_INCONSISTENT` còn đọc `evidence.quote` của ngày học/ngày hết hạn: ngày số D/M đều ≤ 12 (`10/9/2025`) hoặc chỉ tháng/năm ("Valid through 12/2027") → không qua dù LLM đã điền ngày (plan 21, `packages/rules/src/date-quote.ts`). Kiểm: `pnpm --filter @credflow/rules test`; `recorded.test.ts` chạy trên output thật của Haiku (`eval/hard-cases/cpr/recorded/`)
- **Trạng thái:** `uploaded → processing → extracted → auto_approved | needs_review | failed`; sau duyệt: `approved | rejected | reupload_requested` (`DocumentStatus`)
- **Hiện tại (plan 16):** upload đẩy job (`jobId = documentId`), worker gọi Claude thật (`claude-haiku-5-5`, ADR 0008): phân loại mọi file, trích xuất chỉ khi `cpr_card`. CPR đi `uploaded → processing → extracted → auto_approved | needs_review`: `RuleStep` (`apps/api/src/rules/rule-step.ts`) chấm rule với staff của document, `asOf` = ngày UTC (ADR 0010), ghi `ruleResults`, `routing`, `as_of`, `timingMs.rules`. Loại giấy khác đi thẳng `processing → needs_review`, `NO_RULES_EVALUATED`, `as_of` NULL. `versions = { pipeline: "21", prompt: "classify@1+extract-cpr@1", model: "claude-haiku-5-5", rules: "1" }`. `evidence.box` bị bỏ trong code
- **Chạy thật end-to-end (kịch bản 7 plan 16):** `make db-migrate db-seed`, `make dev-api` + `make dev-worker`; login từng user rồi `curl -F file=@eval/hard-cases/cpr/<fixture> /documents`: 01, 03 → `staff-marisol@example.test`; 02 → `staff-tobias@`; 05 → `staff-odalys@`; 04, 06 → `staff@` (mật khẩu `credflow-dev`). Xem `psql`: `select file_name, status, routing, as_of, timing_ms from documents`. Kỳ vọng: 01, 06 `auto_approved`; 02 `MISSING_FIELD`+`EXPIRED`; 04 `NO_RULES_EVALUATED`; 05 `ISSUER_NOT_ACCEPTED` trong eval (staff không gắn khách hàng); trên seed dev Odalys làm cho Bayleaf, config Bayleaf chấp nhận Harrowgate nên 05 `auto_approved` là đúng (plan 25, ghi lại ở plan 28); 03 dao động quanh ngưỡng confidence (`LOW_CONFIDENCE` hoặc `auto_approved` với giá trị đúng)
- **Chạy:** `make dev-api` + `make dev-worker` (worker cần `ANTHROPIC_API_KEY`, **tốn tiền thật**). Xem trạng thái bằng `GET /documents/:id` (staff chủ giấy), màn S1, hoặc `psql`. Log worker có token từng lượt để cộng chi phí
- **Fixture:** `eval/hard-cases/cpr/` (10 giấy SAMPLE: 9 CPR + 1 TB, nguồn HTML, đáp án `cases.json`; 07–10 thêm ở plan 22)
- **Lỗi (ADR 0006):**
  - timeout, mất kết nối, 408, 409, 429, 5xx: thử tối đa 3 lần (chờ 1s, 2s), hết lượt → `needs_review`, `error.step = "pipeline"`
  - 4xx khác, `refusal`: 1 lượt, `needs_review`, `error.step` là `classify` hoặc `extract`, giữ phần đã đọc được
  - output sai schema, `max_tokens`: gọi lại 1 lần trong bước đó, vẫn lỗi thì như trên
  - file không có trong storage → `failed`, 0 lượt gọi LLM; job data sai schema → failed set của BullMQ
- **Redis chết:** upload vẫn `201` (tối đa khoảng 2s), document nằm ở `uploaded`; Redis sống lại thì sweep đẩy lại job
- **Sweep (ADR 0007):** chạy trong worker, 60 giây một vòng, queue `document-sweep`, đăng ký lại lịch mỗi khi kết nối Redis `ready`
  - job còn sống (`waiting`, `active`, `delayed`...) → bỏ qua
  - `uploaded` quá 1 phút → xoá job completed/failed còn giữ rồi `add` lại (`add` trùng `jobId` bị bỏ qua mà không báo lỗi)
  - `processing` hoặc `extracted` quá 15 phút → `needs_review`, `reasons = ["NO_RULES_EVALUATED"]`, `error.step = "sweep"`, không chạy lại
- **Worker chết ở `extracted`:** job retry chỉ chạy lại bước rule, không gọi LLM; bước rule hết retry → `needs_review`, `error.step = "rules"`
- **Chạy trùng job:** chỉ một lần ghi thắng (`WHERE status = from`); job thua nhận conflict, log `warn`, `completed`, không retry
- **Kiểm sẵn có:** `apps/api/test/worker.int-spec.ts`, `apps/api/test/documents-enqueue.int-spec.ts`, `apps/api/test/sweep.int-spec.ts`, `apps/api/test/pipeline.int-spec.ts`, `apps/api/test/pipeline-rules.int-spec.ts` (client LLM giả trả output Haiku đã ghi, `CLOCK` cố định; không tốn tiền)
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
- **Golden kỳ vọng:** `make eval` (mục Eval)
- **Mức rủi ro:** T3 khi đổi prompt / model / rule / ngưỡng

## Duyệt ca (P4, API plan 27, UI plan 28)
- **UI** (reviewer; `/` tự chuyển sang `/review`; vai trò khác thấy `wrong-role`):
  - S2 `/review?reason=&sort=`: `filter-reason`, `filter-sort`, bảng `queue-table` (`queue-row-<id>`, link `queue-open`), `queue-more` (keyset), trống `queue-empty`, xong ca cuối `queue-done`
  - S3 `/review/<id>?<bộ lọc>`: `file-viewer` (`file-image` / `file-pdf`), `failed-rules` (`failed-rule-<CODE>`, `no-failed-rules`), `field-editor` (`field-<tên>`, hàng `field-row-<tên>` có `data-flagged`, `quote-<tên>`), rời ô → preview (`preview-error` khi 400), `decision-note`, `decide-approve` / `decide-reject` / `decide-request_reupload` (2 nút sau khoá khi ghi chú trống), 409 → `notice-conflict` + `reload`, lỗi khác `notice-error`, ca đã xử lý `read-only`, `review-history`
  - Quyết định xong → mở ca đầu hàng chờ cùng bộ lọc; hết ca → `/review?…&done=1`
  - **Chạy L3:** `up.sh --web`, upload thẻ như mục "Pipeline", rồi `ui.mts --login reviewer@example.test --path /review --step …` (SKILL.md)
- **API** (chỉ `reviewer`; staff → `403`):
  - `GET /review/queue?reason=<RuleCode>&sort=due|submitted&limit=1..100&cursor=` → `200 ReviewQueuePage { items, nextCursor }`; chỉ `needs_review`; keyset, cursor sai/khác bộ lọc → `400`
  - `GET /review/documents/:id` → `200 ReviewDocumentDetail { document (có version), staff, reviewActions }`; không có → `404`
  - `GET /review/documents/:id/file` → stream file, `Content-Type` đã lưu, `nosniff`; file mất → `404`
  - `POST /review/documents/:id/preview` body `{ corrections }` → `200 { asOf, ruleResults, routing }`, không ghi DB; chưa có extraction → `409`
  - `POST /review/documents/:id/decision` body `{ action, version, corrections?, note? }` → `200 { document, reviewAction }`; `version` cũ / không còn `needs_review` → `409 CONFLICT`; thiếu note khi reject/reupload, correction sai → `400`
  - Staff: `GET /documents/:id/file` (chỉ giấy của mình, giấy người khác → `404`)
- **Correction:** `fieldPath` = `fields.<tên>.value`, `before` phải khớp giá trị gốc, ngày `YYYY-MM-DD`
- **Dữ liệu:** `documents.status`, `documents.version` (+1 mỗi lần đổi trạng thái), `review_actions` (chỉ insert); `documents.extraction` không bị sửa
- **Test:** `apps/api/test/review-queue.int-spec.ts`, `review-decision.int-spec.ts`, `review-file.int-spec.ts`
- **Kỳ vọng:** 2 quyết định cùng `version` → đúng 1 thành công; mọi chỗ sửa nằm trong `review_actions.corrections`
- **Báo cáo trường hay sửa (plan 29):** `make report-corrections [ARGS="--out <file>"]` đọc `review_actions` của `DATABASE_URL` (chỉ đọc), in Markdown: giấy đã duyệt, số action theo loại, mỗi `fieldPath` có lần sửa / giấy bị sửa / % giấy đã duyệt / AI để trống → điền / đổi giá trị / xoá giá trị. Chưa có chỗ sửa → "Chưa có chỗ sửa nào.". Code `apps/api/src/review/corrections-report.ts`, test `corrections-report.spec.ts`, `apps/api/test/corrections-report.int-spec.ts`. Đối chiếu tay: `SELECT c->>'fieldPath', count(*) FROM review_actions, jsonb_array_elements(corrections) c GROUP BY 1`
- **Bấm giờ trên UI (plan 29):** bước `mark:<nhãn>` của `ui.mts` → JSON có `marks` (ms từ lúc mở trang); hiệu hai mark là thời gian một ca

## Dashboard compliance, cấu hình rule (P5, chưa làm)
- **UI:** `TODO(verify)`: S4, S5 (`docs/flows.md` F4, F0)

---

## Chưa map / TODO
- `apps/web`: chưa có màn nào, chưa có `data-testid`.

## Eval (plan 18)
- **Chạy:** `make eval` (cần `ANTHROPIC_API_KEY`; không cần DB/worker). `ARGS=--no-cache` gọi LLM lại; `ARGS="--split holdout"`
- **Code:** `apps/api/scripts/eval.ts` (CLI), `apps/api/src/eval/` (`run-case`, `compare`, `metrics`, `report`, `cache`, `limit`, `pricing`)
- **Đáp án:** `eval/hard-cases/cpr/cases.json` + `data/synth/cpr/cases.json` nếu có (`GoldenCase[]`, `asOf` cố định); report có cột nguồn; kết quả `eval/runs/<id>.json` (`EvalRun`, gitignore), `eval/report.md` (commit), cache `eval/cache/` (gitignore)
- **Kỳ vọng:** chạy lần hai không đổi gì → `LLM 0 lượt, cache 6`, metric giống hệt; đổi rule/ngưỡng → 0 lượt gọi LLM, decision đổi theo; `cases.json` sai schema → exit 1 kèm `index.trường`
- **Duyệt nhầm:** tự duyệt mà đáp án `needs_review` hoặc đọc sai trường có trong đáp án; report liệt kê ở mục "Duyệt nhầm"
- **Cổng CI (plan 20):** `make eval-ci` = synth `--cases-only` + eval `--recorded --no-save --gate eval/gate.json`; kỳ vọng: không cần khoá, `LLM 0 lượt`, 40 ca dev, `cổng eval: qua (0 ≤ 0)`; vượt mức, thiếu/cũ output ghi sẵn → exit ≠ 0 kèm lý do từng ca. Ghi lại: `make eval ARGS=--record`
- **Kiểm sẵn có:** `apps/api/src/eval/*.spec.ts` (51 test, không gọi LLM)
- **Mức rủi ro:** T2 (số liệu quyết định thay đổi T3)

## Synth (plan 19)
- **Chạy:** `make synth SEED=1` (lần đầu: `pnpm --filter @credflow/synth exec playwright install chromium`) → `data/synth/cpr/` (40 file ảnh/PDF + HTML + `cases.json`)
- **Kỳ vọng:** cùng seed → mọi file giống byte trên cùng máy (`shasum -a 256 data/synth/cpr/*`); 30 dev / 10 holdout; mọi thẻ có watermark SAMPLE; chưa cài Chromium → exit 1 kèm lệnh cài
- **Đáp án:** `tools/synth/src/policy.ts` (bảng kịch bản Liam duyệt), không dùng rule engine
- **Kiểm sẵn có:** `tools/synth/src/*.test.ts` (28 test, không cần trình duyệt)
- **Xem tay:** mở `data/synth/cpr/synth-cpr-NNNN.html` hoặc ảnh; PDF xem bằng trình duyệt


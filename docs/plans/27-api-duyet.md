# 27 · API duyệt: hàng chờ, quyết định, file, preview

Phase: P4 · Trạng thái: Đã duyệt · Ngày: 2026-11-06

## Mục tiêu
Reviewer có đủ API để xử lý một ca `needs_review`: xem hàng chờ (lọc theo lý do, sắp theo hạn, phân trang keyset), xem chi tiết, xem file gốc, thử sửa trường và xem rule chấm lại (preview), rồi ra quyết định. Quyết định ghi `documents` + `review_actions` trong một transaction, có optimistic lock `version`: 2 request cùng `version` thì đúng 1 thành công, request kia nhận 409. Plan 28 (UI S2, S3) chỉ còn dựng giao diện trên API này.

## Phạm vi
- Trong:
  - Cột `documents.version` (int, NOT NULL, default 1), **mọi** lần đổi trạng thái tăng 1 (cả worker, sweep).
  - `GET /review/queue`, `GET /review/documents/:id`, `GET /review/documents/:id/file`, `POST /review/documents/:id/preview`, `POST /review/documents/:id/decision`. Tất cả `@Roles("reviewer")`.
  - `GET /documents/:id/file` cho staff (chỉ giấy của mình, 404 như `GET /documents/:id`).
  - Repository `review_actions` chỉ có insert.
- Ngoài: UI (plan 28); báo cáo trường hay bị sửa, 10 ca bằng UI (plan 29); highlight `box` (plan 28/P5, Liam 2026-11-06); admin duyệt (vai trò `admin` không vào hàng chờ ở plan này); nộp lại tạo document mới nối với cái cũ.

## Thiết kế

**Hàng chờ** `GET /review/queue?reason=EXPIRED&sort=due|submitted&limit=20&cursor=...`
- Chỉ `status = 'needs_review'`. `reason` (RuleCode, tuỳ chọn) lọc bằng `routing->'reasons' ? :reason`.
- `sort=due` (mặc định): khoá `due_key = COALESCE(extraction->'fields'->'expirationDate'->>'value', '9999-12-31')` tăng dần, rồi `id`. Giấy không có hạn xuống cuối mà khoá vẫn là chuỗi không null, keyset đơn giản. `sort=submitted`: `(created_at, id)` tăng dần (cũ nhất trước).
- Keyset: `WHERE (key, id) > (:k, :id) ORDER BY key, id LIMIT :limit + 1`; dư 1 dòng thì có `nextCursor`. Cursor = base64url của JSON `{sort, k, id}`, parse bằng Zod; sai/khác `sort` → 400.
- Item trả gọn: `id, staffId, staffName, fileName, docType, reasons, dueDate (null nếu không có), createdAt, version`.
- Index mới: partial expression index `(due_key, id) WHERE status = 'needs_review'`; xem `EXPLAIN` như plan 26.

**Chi tiết** `GET /review/documents/:id`: `DocumentView` (đã có `version`) + `staff` (tên, khách hàng) + `reviewActions[]` (lịch sử, cũ trước). Không có → 404. Mọi trạng thái đều xem được (để xem lại ca đã duyệt), chỉ `needs_review` mới ra quyết định được.

**File** `GET .../file`: thêm `Storage.openRead(key): Promise<Readable | null>` (LocalStorage: `fs.createReadStream`), đặt `Content-Type` = `mimeType` đã lưu, `Content-Disposition: inline`, `X-Content-Type-Options: nosniff`, stream bằng `pipeline`. Không đọc cả file vào memory. File mất → 404. Tên file người dùng không vào header (chỉ id).

**Preview** `POST /review/documents/:id/preview` body `{ corrections[] }`: lấy extraction gốc, áp corrections, chạy rule thuần với **`asOf` đã lưu** của document (ADR 0010; không có thì `clock.todayUtc()`), trả `{ ruleResults, routing }`. Không ghi DB. Áp correction: `fieldPath` dạng `fields.<tên>.value` (như fixture `ReviewAction` có sẵn) phải là trường có thật của `extraction.docType` (sai → 400); `after` parse bằng schema của trường (ngày phải `YYYY-MM-DD`); trường được sửa có `confidence = 1`, **giữ nguyên evidence gốc**: không bịa evidence, nên trường không có chữ gốc vẫn trượt `MISSING_EVIDENCE` trong preview (đúng nguyên tắc; người duyệt nhìn ảnh và tự quyết). Tách logic chấm rule khỏi `RuleStep` thành hàm dùng chung để worker và preview chấm cùng một cách.

**Quyết định** `POST /review/documents/:id/decision` body `DecisionRequest = { action, version, corrections[] (default []), note? }`:
- `note` bắt buộc (không rỗng sau trim) khi `reject` / `request_reupload` (Zod `superRefine`, Liam câu 5).
- `corrections` kiểm như preview; `before` do **server** điền từ extraction gốc (client gửi `before` khác thật → 400, để dữ liệu "trường hay bị sửa" không bị sai).
- Trong `db.transaction(tx => ...)`: `DocumentStatusService.transition(id, "needs_review", to, {}, {reviewerId}, {tx, expectedVersion: version})` → `UPDATE ... SET status, version = version + 1 WHERE id AND status = 'needs_review' AND version = :v RETURNING`; 0 dòng → `DocumentStatusConflictError` → 409. Rồi `ReviewActionsRepository.insert(tx, ...)`. Lỗi giữa chừng → rollback cả hai.
- Corrections chỉ nằm trong `review_actions`, **không** ghi đè `documents.extraction` (Liam câu 4: giữ output LLM gốc cho eval).
- Response: `{ document: DocumentView, reviewAction: ReviewAction }`, 200.
- 404 khi không có document; 409 khi `version` cũ hoặc không còn `needs_review` (message cố định, kèm `currentVersion` không cần: client tải lại).

**`DocumentStatusService.transition`**: thêm tham số thứ năm `opts?: { tx?: Db | Tx; expectedVersion?: number }`, luôn `version = version + 1`. Vẫn là nơi duy nhất ghi `status` (A11). Worker, sweep không đổi lời gọi.

## Thay đổi
| File / module | Thay đổi |
| --- | --- |
| `packages/contracts/src/routing.ts` | `DocumentRecord.version` (int ≥ 1); `DecisionRequest`, `DecisionResponse`, `PreviewRequest`, `PreviewResponse`; tách `Correction` ra schema riêng (cùng hình dạng cũ, `ReviewAction` dùng lại) |
| `packages/contracts/src/review.ts` (mới) + `index.ts` | `ReviewQueueQuery` (strictObject), `ReviewQueueItem`, `ReviewQueuePage {items, nextCursor}`, `ReviewDocumentDetail` |
| `apps/api/src/db/schema.ts` + `apps/api/drizzle/0006_*.sql` | cột `version`, CHECK `version >= 1`, index hàng chờ |
| `apps/api/src/documents/document-status.service.ts` | `opts.tx`, `opts.expectedVersion`, tăng `version` |
| `apps/api/src/documents/documents-read.service.ts`, `documents.controller.ts` | thêm `version` vào cột view; `GET /documents/:id/file` |
| `apps/api/src/storage/storage.ts`, `local-storage.ts`, `send-file.ts` (mới) | `openRead(key)`; helper stream file dùng chung cho route reviewer và staff |
| `apps/api/src/rules/rule-step.ts` + `apps/api/src/rules/rule-scorer.ts` (mới) | tách hàm thường `scoreDocument` dùng chung (đọc staff profile + `evaluateRulesForConfigs` + `route`); hàm thường, không phải provider, để không phải sửa `worker.module.ts` (vùng kiến trúc) |
| `apps/api/src/review/` (mới) | `review.module.ts`, `review.controller.ts`, `review-queue.service.ts` (+ cursor), `review-decision.service.ts`, `review-actions.repository.ts` (chỉ `insert`, `listForDocument`), `corrections.ts` (áp + kiểm correction, hàm thuần) |
| `apps/api/src/app.module.ts` | import `ReviewModule` |
| `apps/api/test/review-*.int-spec.ts` (mới) | integration test (xem verification plan) |
| `apps/api/src/review/*.spec.ts` | unit: cursor, corrections, `DecisionRequest` |
| `docs/flows.md`, `.claude/skills/verify/FEATURE_MAP.md` | thêm luồng duyệt / dòng feature map (FEATURE_MAP là vùng, khai bên dưới) |

## Vùng kiến trúc bị chạm
- `packages/contracts/src/**`
- `apps/api/src/db/schema.ts`
- `apps/api/drizzle/**`
- `apps/api/src/app.module.ts`
- `.claude/skills/verify/**`

## Contract / config / prompt bị ảnh hưởng
- **Contract (cần Liam duyệt):** thêm `DocumentRecord.version` (lan sang `DocumentView`, response `GET /documents*` có thêm trường); schema mới `DecisionRequest/Response`, `PreviewRequest/Response`, `ReviewQueue*`, `ReviewDocumentDetail`; tách `Correction` (không đổi hình dạng `ReviewAction`).
- **Schema DB:** cột `documents.version`, CHECK, index partial hàng chờ. Migration chỉ thêm, dòng cũ nhận `version = 1`.
- Không đổi rule, config rule, prompt, model, ngưỡng → không cần `make eval` (vẫn chạy `make eval-ci` như CI).

## Quyết định đáng nhớ
- **Chỗ khó nhất:** 409 phải đến từ Postgres, không từ code đọc rồi so: `UPDATE ... WHERE version = :v` trong cùng transaction với insert `review_actions`; đọc-rồi-kiểm ở Node thì 2 request đua nhau đều qua.
- **Loại:** ghi corrections vào `documents.extraction` (mất output LLM gốc, eval không biết LLM sai ở đâu; Liam câu 4). Loại `SELECT ... FOR UPDATE` (pessimistic lock): giữ lock trong lúc người duyệt suy nghĩ là không được, còn lock ngắn trong request thì vẫn cần client gửi `version` để biết họ đã nhìn bản nào. Loại offset pagination: duyệt xong một ca thì cả trang trượt, người duyệt bỏ sót ca.
- **Worker cũng tăng `version`:** nếu sweep đẩy lại ca trong lúc reviewer đang mở, quyết định dựa trên bản cũ bị 409 thay vì ghi đè.
- **Khi nào hỏng:** khoá sắp xếp đọc từ jsonb `expirationDate` chỉ đúng với loại giấy có trường đó (P5 thêm loại khác thì `due_key` phải là cột tính sẵn hoặc biểu thức theo `docType`); cursor base64 không ký, client sửa được nhưng chỉ tự làm lệch trang của mình.
- **Học nâng cao (ghi `docs/roadmap.md`):** cursor có ký (HMAC), `SKIP LOCKED` để chia ca giữa nhiều reviewer.

## Tiêu chí xong
- [ ] 2 request `decision` cùng `version` chạy song song (`Promise.all`): đúng 1 trả 200, 1 trả 409; `review_actions` có đúng 1 dòng; `version` tăng đúng 1.
- [ ] Lỗi sau khi UPDATE (insert `review_actions` hỏng) → `documents` không đổi (rollback).
- [ ] Mọi correction gửi lên xuất hiện trong `review_actions.corrections` với `before` lấy từ extraction gốc; `documents.extraction` không đổi.
- [ ] Hàng chờ: lọc `reason`, sắp `due` (null cuối) và `submitted`, keyset qua nhiều trang không trùng không sót kể cả khi ca ở trang 1 được duyệt giữa chừng; `EXPLAIN` dùng index mới.
- [ ] File: reviewer xem được mọi giấy; staff chỉ giấy của mình (người khác → 404); staff gọi `/review/*` → 403.
- [ ] `reject`/`request_reupload` không có `note` → 400; `approve` ca không còn `needs_review` → 409.
- [ ] `make lint typecheck test test-int eval-ci` xanh.
- [ ] Evidence report (skill `verify`) có trong PR, kết quả ✅ hoặc phần chưa kiểm đã được Liam chấp nhận.

## Rủi ro / câu hỏi
- `transition()` thêm tham số `opts` → các lời gọi cũ không đổi, nhưng test `pipeline.int-spec` / `sweep.int-spec` cần thêm khẳng định `version` tăng.
- Preview dùng `asOf` đã lưu: ca chấm từ lâu thì `EXPIRED` trong preview khác "hôm nay". Chọn vậy để preview so được với kết quả gốc; plan 28 hiển thị `asOf` cạnh kết quả.

## Verification plan

**Mức rủi ro:** T3: đổi contract + schema DB, đường ra quyết định duyệt (approve do người), transaction và concurrency.

**Hành vi kỳ vọng (theo cách người dùng nói):**
- Reviewer mở hàng chờ thấy ca `needs_review` sắp theo hạn gần nhất, lọc được "chỉ ca `EXPIRED`", lật trang không mất ca.
- Reviewer sửa ngày hết hạn, bấm xem trước thì thấy rule chấm lại; bấm duyệt thì giấy thành `approved`, chỗ sửa nằm trong lịch sử duyệt.
- Hai reviewer cùng duyệt một ca: một người thành công, người kia được báo ca đã thay đổi (409), không có hai bản ghi duyệt.
- Từ chối hoặc yêu cầu nộp lại mà không ghi lý do thì bị chặn.
- Staff không xem được hàng chờ, không xem được file của người khác.

**Các mức kiểm:**
- [ ] L0 Static: `make lint`, `make typecheck` (lint A11 vẫn chỉ cho `DocumentStatusService` ghi `status`).
- [ ] L1 Unit (`make test`): cursor encode/decode + sai cursor; `applyCorrections` (fieldPath sai, ngày sai định dạng, `before` lệch, confidence = 1, evidence giữ nguyên); `DecisionRequest` (note bắt buộc theo action); hàm chấm rule tách ra cho cùng kết quả với trước.
- [ ] L2 Integration (`make test-int`, db-test + supertest, user seed reviewer/staff):
  - `review-decision.int-spec.ts`: approve/reject/reupload; 2 request song song cùng `version` → 200 + 409, 1 dòng `review_actions`; `version` cũ → 409; ca `auto_approved` → 409; rollback: override `ReviewActionsRepository` trong testing module cho `insert` ném lỗi → 500, `documents.status` và `version` không đổi; CHECK `version >= 1` (UPDATE `version = 0` → 23514).
  - `review-queue.int-spec.ts`: seed 25 ca `needs_review` khác hạn + 3 ca không hạn + ca trạng thái khác; lọc `reason`; 2 kiểu sort; đi hết trang = đúng tập; duyệt 1 ca trang 1 rồi lấy trang 2 bằng cursor cũ → không trùng không sót; `EXPLAIN` thấy index.
  - `review-file.int-spec.ts`: reviewer 200 đúng byte + `Content-Type` + `nosniff`; staff khác → 404; staff → `/review/*` 403; file mất → 404.
  - `review-preview.int-spec.ts`: sửa `expirationDate` của ca `EXPIRED` thành ngày sau `asOf` → preview `EXPIRED` qua; DB không đổi (`updatedAt`, `version` như cũ).
  - `pipeline.int-spec`/`sweep.int-spec`: thêm khẳng định `version` tăng mỗi transition.
  - Không sửa `db-constraints.int-spec.ts` (file vùng guardrail): CHECK mới kiểm trong `review-decision.int-spec.ts`.
- [ ] L2 API đang chạy: `make dev`, đăng nhập reviewer seed bằng curl, upload thẻ hết hạn (fixture SAMPLE) bằng staff → đợi `needs_review` → queue → detail → file (lưu ra scratchpad, so sha256) → preview → decision → decision lần 2 cùng `version` (409) → `GET /documents/:id` bằng staff thấy `approved`.
- [ ] L2 Eval: không đổi prompt/model/rule/ngưỡng → chỉ `make eval-ci` (cổng 0).
- [ ] L3 E2E UI: không (UI ở plan 28).
- [ ] L4: `EXPLAIN` hàng chờ trên ~20k dòng như plan 26 (Seq Scan vs Index Scan).

**Kịch bản sẽ chạy:**
| # | Kịch bản | Input / fixture | Kết quả quan sát được kỳ vọng |
|---|---|---|---|
| 1 | duyệt chuẩn có sửa | ca `needs_review` (`DATE_INCONSISTENT`), sửa `fields.expirationDate` | 200, `approved`, `version` +1, 1 `review_actions` có correction `before` = giá trị LLM, `extraction` không đổi |
| 2 | đua nhau | 2 request song song cùng `version` | 1×200, 1×409, 1 dòng `review_actions` |
| 3 | thiếu note | `reject` không `note` | 400, DB không đổi |
| 4 | ca không còn chờ | approve ca `auto_approved` / đã `approved` | 409 |
| 5 | phân trang khi dữ liệu đổi | 28 ca, limit 10, duyệt 1 ca giữa trang 1 và 2 | đủ 27 ca còn lại, không trùng |
| 6 | quyền file | staff A xem file staff B | 404, không lộ |
| 7 | preview | sửa hạn ca `EXPIRED` | `EXPIRED.passed = true`, DB không đổi |
| 8 | correction sai | `fields.khongCo`, ngày `09/02/2025`, `before` lệch | 400 |

**Test mới phải đỏ trên code cũ:**
- Test đua nhau (kịch bản 2): chạy với `expectedVersion` bỏ khỏi WHERE (chỉ còn `status`) → vẫn đúng 1 thắng nhờ `status`; nên thêm biến thể: request 1 dùng `version` cũ sau khi worker/sweep đã tăng `version` mà status vẫn `needs_review` → phải 409; bỏ điều kiện `version` thì test này **đỏ**. Ghi output đỏ vào evidence.
- Rollback: tạm bỏ `db.transaction` (gọi thẳng `this.db`) → test rollback đỏ.
- Keyset "duyệt giữa chừng": thay bằng offset tạm thời → test đỏ (sót 1 ca).
- `before` do server điền: tạm dùng `before` của client → test kịch bản 8 đỏ.

**Thay đổi feature map:** thêm dòng "Duyệt ca (API)": endpoint `/review/*`, test `review-*.int-spec.ts`, cách chạy L2 bằng curl.

**Những gì sẽ KHÔNG kiểm, và lý do:**
- UI S2/S3 và mục tiêu "dưới 30 giây/ca": plan 28, 29.
- Highlight `box`: hoãn theo Liam (câu 6).
- Nhiều reviewer chia ca (`SKIP LOCKED`), S3 storage: ngoài phạm vi P4.
- Liam kiểm tay T3: để phase cuối (Liam 2026-11-06); Claude tự chạy đủ kịch bản trên và ghi evidence.

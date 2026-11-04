# 12d · Guardrail A6, A7 (và CHECK một dòng khác) trên bảng `documents`

Phase: P1 · Trạng thái: Xong · Ngày: 2026-11-04

> Đổi schema DB → **T3**. Liam duyệt **từng CHECK** ở bảng "Đề xuất" bên dưới.

## Mục tiêu

Postgres tự từ chối các dòng `documents` ở trạng thái không thể có: đã qua xử lý mà thiếu `versions`, `failed` mà thiếu `error`, và các CHECK một dòng khác mà Liam chọn. Pipeline (plan 12 BullMQ) có bug ghi thiếu thì lỗi nổ ngay ở câu UPDATE: 500 + log, không âm thầm lưu dữ liệu hỏng.

## Quyết định đã chốt (Liam, 2026-11-04)

| # | Quyết định |
| --- | --- |
| 1 | Làm A6, A7, C1, C2, C4, C5. Không làm C3, C6. Làm F1 |
| 2 | Test C1/C2 dựng `ruleResults`/`routing` từ `packages/contracts/fixtures` (`RuleResult.json`, `RoutingDecision.json`, parse bằng schema), không viết JSON tay. Đổi contract → fixture/test đỏ. GUARDRAILS ghi "đổi `RuleResult`/`RoutingDecision` → xem lại CHECK C1, C2" |
| 3 | C3 → Watchlist: "bật C3 khi contract có mã cho ca LLM lỗi → `needs_review`" |
| 4 | C5: **xử lý lại đi sang `processing`, không về `uploaded`**. Muốn về `uploaded` là thay đổi kiến trúc: `DROP CONSTRAINT` qua plan riêng |
| 5 | A6: plan 12 phải ghi `versions` khi vào `processing` (ghi ở "Tiếp theo" của STATUS) |
| 6 | F1: test đỏ trước; **tuyệt đối không log `detail`** (chứa giá trị dòng) |

## Hiện trạng đã kiểm

- **DB dev:** bảng `documents` **đang rỗng**. Đã dọn ở plan 11, chưa có pipeline. Query vi phạm A6 = 0, A7 = 0 (output ở mục Verification). Migration sẽ không bị dòng cũ chặn. Vẫn chạy lại query này ngay trước khi migrate.
- **Filter (yêu cầu 4) đã có từ plan 08:**
  - `CONFLICT_PG_CODES = {23505, 23503}`; 23514/23502 → 500 `INTERNAL` + `logger.error`.
  - Test có sẵn: `all-exceptions.filter.spec.ts:124` `"%s → 500 INTERNAL, có log"`.
- **Lỗ còn lại ở filter:** log hiện chỉ in `exception.stack`. Lỗi Drizzle (`DrizzleQueryError`) có message `Failed query: …`, còn **mã pg và tên constraint nằm ở `.cause`**, nên nhiều khả năng không vào log. Khi CHECK nổ, người đọc log không biết CHECK nào. Xem đề xuất F1.

## Phạm vi

- **Trong:**
  - CHECK trên `documents` trong `apps/api/src/db/schema.ts` + migration `drizzle-kit generate`.
  - Test integration cho từng CHECK.
  - F1 (log `cause`) nếu Liam duyệt.
  - GUARDRAILS.
- **Ngoài (không làm bằng CHECK):** mọi luật **liên bảng** hoặc **liên trạng thái**. Danh sách ở cuối, thuộc A11 / plan 12.

## Đề xuất (Liam chọn)

Tên constraint giữ theo `GUARDRAILS.md`. Mọi biểu thức đều chỉ đọc một dòng và là immutable (`jsonb_array_length`, `->>`, `jsonb_path_exists` không có `_tz`).

| # | Tên | Luật (SQL) | Vì sao | Có thể sai khi |
| --- | --- | --- | --- | --- |
| **A6** | `documents_versions_after_processing` | `status IN ('uploaded','processing') OR versions IS NOT NULL` | Mọi kết quả phải tái lập được (CLAUDE.md: lưu `versions`) | Pipeline `failed` **trước** khi biết version, vd file mất lúc worker mở. Cách tránh: worker ghi `versions` ngay lúc chuyển sang `processing`, vì version là cấu hình, biết từ đầu. Plan 12 phải làm vậy |
| **A7** | `documents_failed_has_error` | `status <> 'failed' OR error IS NOT NULL` | `failed` không lý do thì không debug được (`error.step`) | Không thấy ca hợp lệ nào |
| C1 | `documents_auto_approved_routing` | `status <> 'auto_approved' OR (routing->>'decision' = 'auto_approve' AND jsonb_array_length(routing->'reasons') = 0)` | Phòng thủ chiều sâu cho A4 ở tầng DB: không có `routing` auto thì không thể là `auto_approved` | Đổi shape `RoutingDecision` (đổi tên field) thì phải sửa CHECK. Contract `routing` đã chốt nên ít rủi ro |
| C2 | `documents_auto_approved_no_block_fail` | `status <> 'auto_approved' OR (jsonb_array_length(rule_results) > 0 AND NOT jsonb_path_exists(rule_results, '$[*] ? (@.severity == "block" && @.passed == false)'))` | Mạnh nhất cho `falseApproveRate`: kể cả khi `route()` hay code ghi status có bug, DB không cho lưu `auto_approved` khi có rule `block` trượt hoặc không chấm rule nào (khớp `NO_RULES_EVALUATED`) | Gắn chặt với shape `RuleResult` (`severity`, `passed`). Đổi contract thì phải đổi CHECK. Đây là logic nghiệp vụ trùng với `route()` (hai nơi) |
| C3 | `documents_needs_review_routing` | `status <> 'needs_review' OR routing IS NOT NULL` | Người duyệt luôn thấy lý do | **Có thể sai:** `product.md` mục 3 nói LLM parse lỗi sau retry → `needs_review`. Lúc đó chưa chạy rule, và `RuleCode` không có mã cho "LLM lỗi". Muốn C3 thì plan 12 phải ghi `routing` cho ca này, tức là thêm mã (vd `EXTRACTION_FAILED`, đổi contract). Đề xuất: **để sau**, quyết cùng plan LLM |
| C4 | `documents_extracted_has_result` | `status NOT IN ('extracted','auto_approved') OR (classification IS NOT NULL AND extraction IS NOT NULL)` | `extracted` nghĩa là LLM đã trả kết quả; tự duyệt mà không có extraction là vô lý | `needs_review`/`failed` không bắt (`unknown` có thể bỏ qua bước trích xuất). Ít rủi ro |
| C5 | `documents_uploaded_is_clean` | `status <> 'uploaded' OR (classification IS NULL AND extraction IS NULL AND routing IS NULL AND versions IS NULL AND error IS NULL AND rule_results = '[]')` | Document vừa upload không mang kết quả cũ. Nếu sau này "xử lý lại" (đặt về `uploaded`) thì buộc phải xoá kết quả cũ | Nếu Liam muốn giữ kết quả cũ khi xử lý lại (để so sánh) thì CHECK này chặn. Lúc đó lịch sử nên nằm ở bảng riêng |
| C6 | `documents_error_only_when_failed` | `error IS NULL OR status = 'failed'` | Chiều ngược A7: `error` không còn sót khi retry thành công | **Có thể sai:** muốn giữ lỗi lần trước sau retry, hoặc `needs_review` do LLM lỗi muốn ghi `error.step`. Đề xuất: **không làm** |

**Đề xuất của mình:**

- Làm: A6, A7, C1, C2, C4, C5.
- Để sau: C3 (chờ quyết mã lỗi LLM).
- Không làm: C6.

| # | Đề xuất cho filter (yêu cầu 4) | Vì sao |
| --- | --- | --- |
| F1 | `logUnhandled` in thêm `cause` của lỗi pg: `code`, `constraint`, `table`. Không in `detail`, vì nó chứa giá trị của dòng | Không có tên constraint thì log 500 vô dụng khi CHECK nổ. Cũng trả lời câu hỏi còn treo trong STATUS ("log in thêm `error.cause`") |

## Không làm bằng CHECK (ghi rõ chỗ thuộc về)

| Luật | Vì sao không phải CHECK | Thuộc |
| --- | --- | --- |
| `rejected` / `approved` / `reupload_requested` phải có `review_actions` của reviewer thật | liên bảng | A11, plan 12 (hàm ghi status duy nhất, ghi review action cùng transaction) |
| Transition hợp lệ (`uploaded → processing → …`, không nhảy cóc, không quay về) | cần trạng thái cũ, CHECK chỉ thấy dòng mới | A11, plan 12 (bảng transition trong code; trigger nếu cần, sau) |
| Hệ thống không bao giờ tự `rejected` | cần biết ai ghi | A11 |
| `extraction.docType` khớp `classification.docType` | làm được bằng CHECK nhưng là luật nghiệp vụ của pipeline, dễ đổi | plan 12/LLM, test ở code |

## Thay đổi

| File | Thay đổi |
| --- | --- |
| `apps/api/src/db/schema.ts` | thêm `check(...)` theo các mục Liam chọn, mỗi cái một dòng comment trỏ mã luật |
| `apps/api/drizzle/0003_*.sql` + `meta/` | sinh bằng `make db-generate`, đọc lại SQL trước khi commit |
| `apps/api/test/db.ts` | helper `makeProcessedDocument(staffId, status, overrides)`: dòng hợp lệ đầy đủ cho từng status, để test đối chứng |
| `apps/api/test/db-constraints.int-spec.ts` | `describe("A6/A7/...")`: mỗi CHECK có 1 ca vi phạm (`23514` + đúng tên constraint, cả insert lẫn update) và 1 ca hợp lệ |
| `apps/api/src/common/all-exceptions.filter.ts` (+spec) | F1 nếu duyệt |
| `docs/agent/GUARDRAILS.md` | A6, A7 → ✅; thêm dòng cho C* đã làm (nối A4 nếu C1/C2) |

## Contract / config / prompt bị ảnh hưởng

Schema DB (Liam duyệt ở đây). Không đổi contract.

## Tiêu chí xong

- [ ] Query vi phạm trên DB dev = 0 ngay trước khi migrate.
- [ ] Test CHECK mới đỏ trước migration, xanh sau.
- [ ] `make test-int`, `make test`, `make lint`, `make typecheck` xanh.
- [ ] `make db-migrate` chạy được trên DB dev.
- [ ] GUARDRAILS A6, A7 ✅.
- [ ] Evidence report trong PR.

## Rủi ro / câu hỏi

1. Chọn CHECK nào trong A6, A7, C1–C6? Có làm F1 không?
2. A6 buộc plan 12 ghi `versions` ngay khi vào `processing`. Mình sẽ ghi điều này vào plan 12.
3. **Rollback:** Drizzle không sinh down migration. Muốn gỡ thì làm migration mới `DROP CONSTRAINT`. Ghi trong report.

## Verification plan

**Mức rủi ro:** T3. Đổi schema DB là cửa một chiều (dữ liệu thật sau này phải thoả CHECK). Liam xem kiểm chứng ít nhất một lần: đọc SQL migration và output đỏ/xanh.

**Hành vi kỳ vọng:**

- Ghi một document `failed` không có `error`, hoặc `auto_approved` khi có rule `block` trượt… → DB từ chối (23514). API trả 500 `INTERNAL`, log có tên constraint (nếu F1).
- Mọi document hợp lệ theo từng status vẫn ghi được.
- Upload hiện tại (`POST /documents` → `uploaded`) không đổi.

**Các mức kiểm:**

- [ ] L0: `make lint`, `make typecheck`.
- [ ] L1: `make test` (filter spec, gồm F1).
- [ ] L2: `make test-int`:
  - `db-constraints.int-spec.ts` chạy trên Postgres test thật;
  - `documents.int-spec.ts` vẫn xanh (upload không bị CHECK chặn).
- [ ] L2 DB dev:
  - query vi phạm trước migrate;
  - `make db-migrate`;
  - `\d documents` cho thấy các constraint mới;
  - 1 lần `UPDATE … SET status='failed'` trên dòng thử trong transaction `ROLLBACK` → 23514.
- [ ] L2 API: upload 1 file qua API đang chạy → 201 (CHECK không chặn luồng có sẵn). Dọn file và dòng sau đó.

**Kịch bản:**

| # | Kịch bản | Input | Kỳ vọng |
| --- | --- | --- | --- |
| 1 | mỗi CHECK, vi phạm bằng INSERT | `makeProcessedDocument` bỏ đúng một trường | `rejects.toMatchObject({ cause: { code: "23514", constraint: "<tên>" } })` |
| 2 | mỗi CHECK, vi phạm bằng UPDATE | dòng `uploaded` hợp lệ → `UPDATE status=…` thiếu trường | 23514 + tên |
| 3 | mỗi CHECK, đối chứng | dòng hợp lệ đủ trường cho status đó | insert được |
| 4 | upload qua API | `POST /documents` SAMPLE PNG | 201, `status: uploaded` |
| 5 | F1 | lỗi Drizzle bọc pg 23514 có `constraint` | `logger.error` được gọi với chuỗi chứa tên constraint, body không chứa |

**Test mới phải đỏ trên code cũ:**

- `db-constraints` ca vi phạm: chạy **trước** khi thêm `check()`/migration. Insert thành công nên `rejects` đỏ. Dán output.
- F1: chạy spec trước khi sửa filter → đỏ (log không có tên constraint).

**Thay đổi feature map:** mục "Pipeline xử lý" thêm "DB từ chối trạng thái thiếu dữ liệu (CHECK A6, A7, …) → 500 INTERNAL".

**Những gì sẽ KHÔNG kiểm:**

- Pipeline thật ghi đúng các trường (chưa có worker, plan 12).
- Hiệu năng CHECK (`jsonb_path_exists` trên `rule_results` vài chục phần tử, không đáng kể).

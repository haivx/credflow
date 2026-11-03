# 07 · Chốt contract Document + bảng `documents` / `review_actions` + test ràng buộc DB

Phase: P0 · Trạng thái: Xong · Ngày: 2026-11-03

## Mục tiêu

Chốt contract `DocumentRecord` / `ReviewAction` / `DocumentStatus`, tạo hai bảng `documents` và `review_actions` có ràng buộc ở DB (FK, `NOT NULL`, `CHECK`, unique), và có integration test chứng minh Postgres từ chối insert vi phạm. Xong plan này thì đạt tiêu chí P0 "insert vi phạm constraint bị DB từ chối (có test)".

## Quyết định đã chốt (Liam, 2026-11-03, "theo đề xuất")

| # | Quyết định | Lý do |
| --- | --- | --- |
| 1 | Thêm `checksum` (sha256 hex, 64 ký tự), `sizeBytes`, `storageKey` vào `DocumentRecord` | P1 cần `checksum` để dedupe upload bằng unique index. Tạo bảng có sẵn cột thì P1 không phải migration thêm cột NOT NULL vào bảng đã có dữ liệu. `storageKey` tách tên file người dùng (`fileName`, có thể trùng, có ký tự lạ) khỏi chỗ lưu thật, để đổi local → S3 không phải đổi dữ liệu. `sizeBytes` dùng để giới hạn upload và hiển thị. |
| 2 | Thêm `extracted` vào `DocumentStatus` (giữa `processing` và nhánh routing) | Roadmap P1 vẽ state machine có `extracted`. Có trạng thái này thì phân biệt được "LLM xong, chưa chạy rule" với "đang gọi LLM"; worker chết giữa chừng thì chạy lại từ rule, không gọi LLM lại (đỡ chi phí). Sửa `docs/product.md` dòng 82 cho khớp. |
| 3 | Chưa thêm cột `version` (optimistic locking) | Chưa có chỗ nào cập nhật đồng thời trước P4. Để P4 thì Liam tự viết migration "thêm cột NOT NULL DEFAULT vào bảng đã có dữ liệu", cũng là một bài học. Thêm sớm thì thành cột chết, không có test nào kiểm. |
| 4 | Thêm `id: Id` vào `ReviewAction` | Bảng chỉ insert vẫn cần khoá chính để tham chiếu từng hành động (audit, báo cáo "trường hay bị sửa"). Một document có thể có nhiều hành động (yêu cầu nộp lại rồi duyệt), nên `documentId` không làm khoá được. |
| 5 | Kết quả pipeline (`classification`, `extraction`, `ruleResults`, `routing`, `versions`, `timingMs`, `error`) lưu thành cột `jsonb` trên `documents` | Đủ cho MVP, khớp 1-1 với `DocumentRecord`, đọc một dòng là có hết. Shape đã được Zod giữ ở ranh giới. P1 khi học job idempotent mới cân nhắc tách `document_steps` (upsert theo `(documentId, step, version)`). Lúc đó có ca cụ thể để so, không tách sớm theo phỏng đoán. |
| 6 | Không tự từ chối, kể cả ca chắc chắn hết hạn (`product.md` §8 mục 4 → chốt) | Đúng nguyên tắc "không chắc thì chuyển cho người, hệ thống không bao giờ tự từ chối". Hết hạn theo ngày LLM đọc ra vẫn có thể sai (đọc nhầm năm, sai định dạng ngày). Từ chối sai làm nhân viên mất việc, còn đưa vào hàng chờ chỉ tốn vài giây của người duyệt. `RoutingDecision` giữ hai nhánh. |

## Phạm vi

- Trong: sửa contract (bỏ nhãn "BẢN NHÁP" ở `document.ts`, `routing.ts`, `common.ts`) + fixture; bảng `documents`, `review_actions` + migration; integration test ràng buộc; cập nhật `product.md` §8 và dòng state machine.
- Ngoài: endpoint đọc/ghi document (P1 upload); Zod pipe, exception filter, format lỗi `{ code, message, details? }` (plan 08); `CHECK` cho transition trạng thái và hàm kiểm transition (P1 state machine); cột `version` (P4); bảng `document_steps` (P1, nếu cần); bảng reviewer/users (sau MVP, đăng nhập thật).
- `extraction.ts`, `rules.ts`, `eval.ts` không đổi. Nhãn "BẢN NHÁP" ở đó em đề nghị bỏ luôn nếu Liam đã đọc xong; chưa đọc thì giữ, chốt ở P1 khi dùng thật.

## Contract (thay đổi, cần Liam duyệt)

`packages/contracts/src/routing.ts`:

```ts
DocumentStatus: thêm "extracted" sau "processing"

DocumentRecord: thêm
  checksum: z.string().regex(/^[0-9a-f]{64}$/),   // sha256 hex chữ thường
  sizeBytes: z.number().int().positive(),
  storageKey: z.string().min(1),
  updatedAt: IsoTimestamp,

ReviewAction: thêm
  id: Id,
```

Thêm `updatedAt` vì status đổi nhiều lần; hàng chờ và sweep job ở P1 cần biết document kẹt bao lâu.

Fixture `packages/contracts/fixtures/DocumentRecord.json`, `ReviewAction.json` thêm các trường mới, nếu không `make test` của contracts sẽ fail.

## Schema DB

`apps/api/src/db/schema.ts`, `id` là `text` (ulid) giống `staff`:

**`documents`**

| Cột | Kiểu | Ràng buộc |
| --- | --- | --- |
| `id` | text | PK |
| `staff_id` | text | NOT NULL, FK → `staff.id` (`ON DELETE RESTRICT`) |
| `file_name`, `mime_type`, `storage_key` | text | NOT NULL |
| `size_bytes` | integer | NOT NULL, `CHECK (size_bytes > 0)` |
| `checksum` | text | NOT NULL, unique index, `CHECK (checksum ~ '^[0-9a-f]{64}$')` |
| `declared_doc_type` | text | NULL được, `CHECK` thuộc danh sách `DocType` |
| `status` | text | NOT NULL, DEFAULT `'uploaded'`, `CHECK` thuộc danh sách `DocumentStatus` |
| `classification`, `extraction`, `routing`, `versions`, `error` | jsonb | NULL được |
| `rule_results` | jsonb | NOT NULL, DEFAULT `'[]'` |
| `timing_ms` | jsonb | NOT NULL, DEFAULT `'{}'` |
| `created_at`, `updated_at` | timestamptz | NOT NULL, DEFAULT `now()` |

**`review_actions`**

| Cột | Kiểu | Ràng buộc |
| --- | --- | --- |
| `id` | text | PK |
| `document_id` | text | NOT NULL, FK → `documents.id` (`ON DELETE RESTRICT`), index |
| `reviewer_id` | text | NOT NULL (chưa có FK: chưa có bảng reviewer) |
| `action` | text | NOT NULL, `CHECK` thuộc `approve`, `reject`, `request_reupload` |
| `corrections` | jsonb | NOT NULL, DEFAULT `'[]'` |
| `note` | text | NULL được |
| `created_at` | timestamptz | NOT NULL, DEFAULT `now()` |

Danh sách trong `CHECK` lấy từ `DocumentStatus.options` / `DocType.options` của contracts, không gõ tay lần hai (một nguồn sự thật). Thêm giá trị vào enum thì `make db-generate` ra migration đổi `CHECK`.

`RESTRICT` (không `CASCADE`): `review_actions` là dữ liệu audit/eval, xoá document không được kéo theo xoá lịch sử duyệt.

## Thay đổi

### Claude làm (boilerplate)

| File | Thay đổi |
| --- | --- |
| `packages/contracts/src/{routing,document,common}.ts` | Sửa contract theo mục trên, bỏ nhãn "BẢN NHÁP", ghi "Đã chốt 2026-11-03 (plan 07)". |
| `packages/contracts/fixtures/*.json` | Thêm trường mới. Thêm ca fixture `DocumentRecord` trạng thái `uploaded` (chưa có kết quả pipeline). |
| `docs/product.md` | §8 mục 1, 4 → đã chốt; dòng 82 thêm `extracted`. `docs/flows.md` nếu cần. |
| `apps/api/test/db.ts` (helper) | `truncateAll(db)` (`TRUNCATE review_actions, documents, staff RESTART IDENTITY CASCADE`), `insertStaff()`, `makeDocument(overrides)` trả row hợp lệ. Cập nhật `staff.int-spec.ts` dùng helper (`TRUNCATE staff` đơn lẻ sẽ lỗi khi đã có FK trỏ vào). |
| `docs/learning/notes/p0-db-constraints.md`, `progress.md`, `STATUS.md` | Note + điền `code:`/`note:` cho "Ràng buộc ở DB" (Liam tự tick). |

### Liam tự code (🎓 Ràng buộc ở DB)

Mỗi bước: Claude giải thích ngắn → Liam viết → Claude review.

| Bước | File | Viết gì / học gì |
| --- | --- | --- |
| 1 | `apps/api/src/db/schema.ts` | Bảng `documents`: cột, `.references(() => staff.id, { onDelete: "restrict" })`, `uniqueIndex` trên `checksum`, `check()` cho `status`, `size_bytes`, `checksum`, `declared_doc_type`. Học: callback thứ ba của `pgTable` (index, check), `sql` template trong `check`, vì sao `jsonb` cần `.$type<T>()` để có kiểu. |
| 2 | `apps/api/src/db/schema.ts` | Bảng `review_actions`: FK, `CHECK` cho `action`, index trên `document_id`. Học: Postgres **không** tự tạo index cho FK (khác MySQL). Vì sao cần index ở đây (P4 lấy lịch sử duyệt của một document). |
| 3 | `apps/api/drizzle/0001_*.sql` | `make db-generate`, **đọc SQL sinh ra** trước khi chạy: đúng tên constraint, đúng `ON DELETE`, có `CHECK`. `make db-migrate` lên DB dev, `\d documents` trong `psql` để xem. Học: migration là code phải review, không chạy mù. |
| 4 | `apps/api/test/db-constraints.int-spec.ts` | Mỗi ràng buộc một test, insert thẳng qua Drizzle (không qua API), kiểm `cause.code` của lỗi Postgres: FK sai → `23503`; trùng `checksum` → `23505`; `status: "done"` → `23514`; `checksum` không phải hex → `23514`; thiếu `staff_id` (SQL thô, vì Drizzle chặn ở kiểu) → `23502`; xoá staff còn document → `23503`. Thêm 1 test insert hợp lệ thì thành công, để chắc test lỗi không fail vì lý do khác. Học: SQLSTATE code; Drizzle bọc lỗi nên mã nằm ở `error.cause` (gặp ở plan 06); vì sao kiểm mã lỗi chứ không kiểm message. |

## Test và cách kiểm tra

- Unit test: `make test` (fixtures contracts pass với trường mới).
- Integration test: `make test-int` (thêm `db-constraints.int-spec.ts`; `staff.int-spec.ts`, `ready.int-spec.ts` vẫn pass). Chạy 2 lần liên tiếp vẫn pass.
- `make typecheck`, `make lint` pass.
- Tay: `make db-migrate && make db-seed` trên DB dev chạy được, seed vẫn idempotent; `psql` `\d documents` thấy đủ constraint.
- Eval: không cần (không đụng prompt/model/rule).

## Tiêu chí xong

- [x] Contract `DocumentRecord`, `ReviewAction`, `DocumentStatus` đã chốt (bỏ nhãn nháp), fixture cập nhật, `product.md` §8 mục 1 và 4 đánh dấu đã chốt.
- [x] Migration `0001` tạo hai bảng đúng bảng schema trên; danh sách `CHECK` lấy từ contracts.
- [x] Integration test chứng minh DB từ chối: FK sai, trùng checksum, status lạ, checksum sai dạng, thiếu NOT NULL, xoá staff còn document.
- [x] `make test`, `make test-int`, `make typecheck`, `make lint` pass.
- [x] `progress.md` điền `code:`/`note:`; `STATUS.md` cập nhật.

## Rủi ro / câu hỏi

1. Drizzle sinh `CHECK` từ `sql` template: nếu nhúng danh sách enum bằng `sql.raw` thì phải tự quote. Bước 1 sẽ xem SQL sinh ra để chắc đúng, và không có dữ liệu ngoài đi vào chuỗi này (chỉ hằng số từ contracts).
2. `updatedAt` chưa tự cập nhật (không dùng trigger). Ở P1, code đổi status sẽ set `updated_at = now()`. Trigger để sau nếu thấy hay quên.
3. `reviewer_id` chưa có FK. Ghi rõ trong schema; thêm khi có đăng nhập thật (sau MVP).
4. Không cần ADR: các quyết định nằm trong spec đã có (product.md, roadmap). Lý do ghi ở bảng trên và ở note học. Nếu Liam muốn ghi riêng quyết định 5 (jsonb thay vì bảng step) thì thêm ADR 0004.
5. Làm thêm so với plan (2026-11-03): `.$type<DocumentStatus>()`, `.$type<DocType>()`, `.$type<ReviewAction["action"]>()` trên cột text để TS chặn giá trị lạ trước cả DB; test `CHECK` cho `review_actions.action`; export type `Classification`, `DocumentStatus`, `Versions` trong contracts. Kiểm 2026-11-03: `make test-int` 11 test pass; `make test`, `make typecheck`, `make lint` pass.

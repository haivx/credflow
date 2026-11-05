# STATUS

> Claude Code đọc file này đầu mỗi phiên và cập nhật cuối phiên (`/wrap`). Giữ ngắn, dưới 40 dòng.

**Cập nhật:** 2026-11-05
**Phase hiện tại:** P1 · Lát cắt dọc cho thẻ CPR (`docs/roadmap.md`). P0 xong 2026-11-03.

## Đang làm

- Plan 02–11 xong, đã merge (PR #1–#8, #10, #11). P0 xong.
- Plan 10 đăng nhập cơ bản: merge PR #10 (CI xanh) 2026-11-03.
- Plan 11 upload stream + sha256 + dedupe (ADR 0005): merge PR #11 (CI xanh) 2026-11-04.

## Đang học

> Claude cập nhật sau **mỗi bước**, không chờ cuối phiên. Mở phiên mới gõ `/tiep` để làm tiếp.

- **Mục 🎓:** (không có 🎓 mới) 12g (A2) chờ Liam merge.
- **Đã xong:** A8 ✅ đã merge (PR #22). 12g: `parseJson`, lint A2 (6 rule + `JSON.parse`), `@Param` và cookie qua Zod, `pg-error.ts` bỏ `as`. A2 🟡 vì job data, LLM, `jsonb`, golden chưa có code.
- **Bước tiếp theo:** Liam merge PR 12g → plan 12 BullMQ (nhớ các dòng ở "Tiếp theo").
- **Câu hỏi còn treo:** Liam "tạm hiểu" vì sao cần `@Inject(DB)`. Có bật branch protection (bắt CI xanh mới merge) không.

## Tiếp theo

1. P1: contract `extraction`, `rules` chốt ở P1; model LLM chốt ở P1 (ADR).
2. Task đầu P1 chọn bằng `/next`.
3. **Plan 12 BullMQ phải ghi `versions` khi chuyển document sang `processing`** (CHECK A6 `documents_versions_after_processing`: `failed` không có `versions` bị DB từ chối). Worker nạp `RulesConfig` + gọi `assertRulesReady` lúc khởi động (12c). Log của worker và cột `documents.error` dùng `formatErrorForLog` (12e), không ghi `err.message` thô.
4. **Plan 12: job data đọc từ Redis phải parse bằng schema trong `packages/contracts`.** `Worker<T>`/`Job<T>` chỉ là khai báo kiểu, không kiểm gì lúc chạy, và lint `no-unsafe-*` không thấy được.

## Vướng / câu hỏi mở

- (chưa có)

## Eval mới nhất

- Chưa có (bắt đầu từ P2).

## Nhật ký

- 2026-10-27: tạo skeleton (docs, contract nháp, rule engine stub, khung web/api/eval/synth).
- 2026-10-29: chốt NestJS + BullMQ (ADR 0001 viết lại); roadmap theo lộ trình học mức middle; thêm `docs/learning/` và chế độ dạy (plan 01).
- 2026-11-01: plan 02 merge (PR #1); plan 03 build packages ra `dist/` + typed lint (ADR 0003).
- 2026-11-02: plan 04 config env bằng `@nestjs/config` + Zod, merge (PR #3).
- 2026-11-02: plan 05 Drizzle + token `DB` + bảng `staff` + `GET /staff`, merge (PR #4).
- 2026-11-03: plan 06 `/ready` (Postgres + Redis, timeout), DB test `db-test`, `make test-int`, integration test đầu tiên.
- 2026-11-03: plan 08 `ApiError` + Zod pipe + exception filter (pg 23505/23503 → 409), `/staff?role=`, `/staff/:id`; `/ready` 503 không throw nữa.
- 2026-11-03: plan 09 `make setup` đủ migrate + seed, CI (lint, typecheck, test, test-int), kiểm máy sạch đạt → P0 xong.
- 2026-11-03: plan 10 đăng nhập cơ bản (ADR 0004): `users`/`sessions`, scrypt, cookie session, `AuthGuard`/`RolesGuard` toàn cục, FK `review_actions.reviewer_id`.
- 2026-11-03: plan 11 upload (ADR 0005): busboy, sha256 lúc stream, magic bytes, dedupe + 409, `LocalStorage`; chờ Liam viết `hashToTempFile`.
- 2026-11-03: plan 07 chốt contract Document/ReviewAction (+ `checksum`, `extracted`; không tự từ chối), bảng `documents`/`review_actions`, 7 test ràng buộc DB.

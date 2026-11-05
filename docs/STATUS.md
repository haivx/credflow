# STATUS

> Claude Code đọc file này đầu mỗi phiên và cập nhật cuối phiên (`/wrap`). Giữ ngắn, dưới 40 dòng.

**Cập nhật:** 2026-11-05
**Phase hiện tại:** P1 · Lát cắt dọc cho thẻ CPR (`docs/roadmap.md`). P0 xong 2026-11-03.

## Đang làm

- Plan 02–11 xong, đã merge (PR #1–#8, #10, #11). P0 xong.
- Plan 10 đăng nhập cơ bản: merge PR #10 (CI xanh) 2026-11-03.
- Plan 11 upload stream + sha256 + dedupe (ADR 0005): merge PR #11 (CI xanh) 2026-11-04.
- Plan 12 BullMQ (ADR 0006): PR #24, chờ CI và Liam merge.

## Đang học

> Claude cập nhật sau **mỗi bước**, không chờ cuối phiên. Mở phiên mới gõ `/tiep` để làm tiếp.

- **Mục 🎓:** BullMQ, retry, state machine (plan 12). Note: `docs/learning/notes/p1-bullmq.md`. Claude viết cả `assertTransition` theo yêu cầu của Liam, nên Liam cần đọc lại rồi tự trả lời "Tự kiểm".
- **Đã xong:** code, test, kiểm chứng chạy thật plan 12; evidence: `.verify/reports/2026-11-05-bullmq-worker.md`.
- **Bước tiếp theo:** Liam tự chạy hoặc xem chạy một lần (đổi contract nên theo Rule 6 là T3), rồi merge PR #24 → plan 13.
- **Câu hỏi còn treo:** Liam "tạm hiểu" vì sao cần `@Inject(DB)`.

## Tiếp theo

1. **Plan 13:** sweep job + job idempotent + test `queue.add` lỗi → sweep cứu. Sweep cả `processing` quá hạn (DB chết đúng lượt cuối, job stalled). Thử thật: job completed/failed còn giữ có chặn `add` trùng `jobId` không.
2. **Plan LLM (và ADR model):** thay `StubPipeline`, A10, A12. `formatErrorForLog` với lỗi không phải DB vẫn giữ `error.stack`, tức có message gốc, nên lỗi LLM phải không chứa dữ liệu giấy tờ hoặc phải siết hàm này.
3. P1: contract `extraction`, `rules` chốt ở P1; model LLM chốt ở P1 (ADR).

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
- 2026-11-05: plan 12 BullMQ: queue, worker process riêng, retry, state machine, pipeline stub (ADR 0006).
- 2026-11-03: plan 07 chốt contract Document/ReviewAction (+ `checksum`, `extracted`; không tự từ chối), bảng `documents`/`review_actions`, 7 test ràng buộc DB.

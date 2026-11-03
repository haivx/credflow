# STATUS

> Claude Code đọc file này đầu mỗi phiên và cập nhật cuối phiên (`/wrap`). Giữ ngắn, dưới 40 dòng.

**Cập nhật:** 2026-11-03
**Phase hiện tại:** P1 · Lát cắt dọc cho thẻ CPR (`docs/roadmap.md`). P0 xong 2026-11-03.

## Đang làm

- Plan 02–09 xong, đã merge (PR #1–#8). P0 xong.
- Plan 10 (`docs/plans/10-dang-nhap-co-ban.md`), nhánh `feat/10-basic-auth`: code xong, `make lint/typecheck/test/test-int` pass, kiểm tay đạt. Chưa commit/PR. Spec sửa (đăng nhập cơ bản vào MVP), ADR 0004 Chấp nhận.
- Plan 11 (sau plan 10): upload stream + sha256 + dedupe. Đã chốt: busboy; giới hạn 10 MB; checksum unique toàn cục, trùng của staff khác → 409; `staffId` lấy từ user đăng nhập.

## Đang học

> Claude cập nhật sau **mỗi bước**, không chờ cuối phiên. Mở phiên mới gõ `/tiep` để làm tiếp.

- **Mục 🎓:** Đăng nhập cơ bản (plan 10). Liam không tự viết phần nào; Claude code hết. Note `notes/p1-auth-session.md`, 3 dòng mới trong `progress.md` (chưa tick).
- **Bước tiếp theo:** Liam đọc note, trả lời "Tự kiểm" → commit + PR plan 10 → plan 11 upload.
- **Câu hỏi còn treo:** Liam "tạm hiểu" vì sao cần `@Inject(DB)`. Tuỳ chọn: log `/ready` in thêm `error.cause`. Có bật branch protection (bắt CI xanh mới merge) không.

## Tiếp theo

1. P1: contract `extraction`, `rules` chốt ở P1; model LLM chốt ở P1 (ADR).
2. Task đầu P1 chọn bằng `/next`.

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
- 2026-11-03: plan 07 chốt contract Document/ReviewAction (+ `checksum`, `extracted`; không tự từ chối), bảng `documents`/`review_actions`, 7 test ràng buộc DB.

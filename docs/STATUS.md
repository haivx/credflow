# STATUS

> Claude Code đọc file này đầu mỗi phiên và cập nhật cuối phiên (`/wrap`). Giữ ngắn, dưới 40 dòng.

**Cập nhật:** 2026-11-03
**Phase hiện tại:** P1 · Lát cắt dọc cho thẻ CPR (`docs/roadmap.md`). P0 xong 2026-11-03.

## Đang làm

- Plan 02–11 xong, đã merge (PR #1–#8, #10, #11). P0 xong.
- Plan 10 đăng nhập cơ bản: merge PR #10 (CI xanh) 2026-11-03.
- Plan 11 upload stream + sha256 + dedupe (ADR 0005): merge PR #11 (CI xanh) 2026-11-04.

## Đang học

> Claude cập nhật sau **mỗi bước**, không chờ cuối phiên. Mở phiên mới gõ `/tiep` để làm tiếp.

- **Mục 🎓:** (không có 🎓 mới) Test bất biến bằng cách sinh mọi tổ hợp (plan 12b, nhánh `test/12b-route-invariants`, xếp chồng trên 12a).
- **Đã xong:** `route.invariants.test.ts` 5 ca xanh; 4 cách sửa sai (a, b, b', c) đều đỏ đúng bất biến. GUARDRAILS A4 🟡, Watchlist "mã rule trùng".
- **Bước tiếp theo:** Liam merge PR #13 (vẫn OPEN trên GitHub), rồi PR 12b. Plan 12c (`route([])` → `needs_review` + `NO_RULES_EVALUATED`, kiểm `RulesConfig` khi nạp) chờ Liam duyệt. Sau đó plan 12 BullMQ.
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
- 2026-11-03: plan 11 upload (ADR 0005): busboy, sha256 lúc stream, magic bytes, dedupe + 409, `LocalStorage`; chờ Liam viết `hashToTempFile`.
- 2026-11-03: plan 07 chốt contract Document/ReviewAction (+ `checksum`, `extracted`; không tự từ chối), bảng `documents`/`review_actions`, 7 test ràng buộc DB.

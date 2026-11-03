# STATUS

> Claude Code đọc file này đầu mỗi phiên và cập nhật cuối phiên (`/wrap`). Giữ ngắn, dưới 40 dòng.

**Cập nhật:** 2026-11-03
**Phase hiện tại:** P0 · Nền tảng và contract (`docs/roadmap.md`)

## Đang làm

- Plan 02, 03, 04 xong, đã merge (PR #1, #2, #3).
- Plan 05 (`docs/plans/05-drizzle-staff.md`), nhánh `feat/05-drizzle-staff`: Drizzle + token `DB` + bảng `staff` + seed + `GET /staff`. Xong, đã merge (PR #4).
- Plan 06 (`docs/plans/06-ready-integration-test.md`), nhánh `feat/06-ready-integration-test`: `/ready` + DB test + integration test. Xong, đã merge.
- Plan 07 (`docs/plans/07-documents-review-actions.md`), nhánh `feat/07-documents-review-actions`: chốt contract Document, bảng `documents`/`review_actions`, test ràng buộc DB. Xong, đã merge.

## Đang học

> Claude cập nhật sau **mỗi bước**, không chờ cuối phiên. Mở phiên mới gõ `/tiep` để làm tiếp.

- **Mục 🎓:** Ràng buộc ở DB (plan 07) — xong bước 1–4. Note: `docs/learning/notes/p0-db-constraints.md`. Liam tự tick ở `progress.md` khi trả lời được "Tự kiểm".
- **Bước tiếp theo:** `/next` (dự kiến plan 08: Zod pipe + exception filter, format lỗi `{ code, message, details? }`).
- **Code đang dở / câu hỏi còn treo:** Liam "tạm hiểu" vì sao cần `@Inject(DB)`. Tuỳ chọn: log `/ready` in thêm `error.cause`; đổi `console.error` sang `Logger` của Nest.

## Tiếp theo

1. Plan 08: Zod pipe + exception filter (format lỗi thống nhất, map lỗi Postgres `23505`/`23503`). Xong là đủ tiêu chí P0, trừ kiểm `make setup && make dev` trên máy sạch.
2. Contract `extraction`, `rules` vẫn nháp, chốt ở P1.

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
- 2026-11-03: plan 07 chốt contract Document/ReviewAction (+ `checksum`, `extracted`; không tự từ chối), bảng `documents`/`review_actions`, 7 test ràng buộc DB.

# STATUS

> Claude Code đọc file này đầu mỗi phiên và cập nhật cuối phiên (`/wrap`). Giữ ngắn, dưới 40 dòng.

**Cập nhật:** 2026-11-02
**Phase hiện tại:** P0 · Nền tảng và contract (`docs/roadmap.md`)

## Đang làm

- Plan 02, 03, 04 xong, đã merge (PR #1, #2, #3).
- Plan 05 (`docs/plans/05-drizzle-staff.md`), nhánh `feat/05-drizzle-staff`: Drizzle + token `DB` + bảng `staff` + seed + `GET /staff`. Xong, đã merge (PR #4).
- Plan 06 (`docs/plans/06-ready-integration-test.md`), nhánh `feat/06-ready-integration-test`: `/ready` + DB test + integration test. Đã duyệt, boilerplate xong, đang làm phần học (6 bước).

## Đang học

> Claude cập nhật sau **mỗi bước**, không chờ cuối phiên. Mở phiên mới gõ `/tiep` để làm tiếp.

- **Mục 🎓:** `/health` và `/ready`, Integration test với Postgres thật (plan 06, 6 bước).
- **Bước đã xong:** boilerplate: deps `ioredis`/`supertest`, service `db-test` (5433, tmpfs), `make test-int`, `vitest.int.config.ts`, `test/global-setup.ts` (migrate + chặn DB không phải test, đã kiểm), scaffold `src/redis/`.
- **Bước tiếp theo:** bước 1, chọn option ioredis trong `apps/api/src/redis/redis.provider.ts` (TODO).
- **Code đang dở / câu hỏi còn treo:** Liam "tạm hiểu" vì sao cần `@Inject(DB)`. Tuỳ chọn: đổi `console.error` trong `db.provider.ts`/`redis.provider.ts` sang `Logger` của Nest.

## Tiếp theo

1. Liam review và chốt contract bản nháp trong `packages/contracts/src/`.
2. Liam chốt quyết định còn mở ở `docs/product.md` mục 8 (mục 1, 4).
3. `/ready`, DB test riêng + integration test (supertest), bảng `documents`/`review_actions` sau khi chốt contract.

## Vướng / câu hỏi mở

- (chưa có)

## Eval mới nhất

- Chưa có (bắt đầu từ P2).

## Nhật ký

- 2026-10-27: tạo skeleton (docs, contract nháp, rule engine stub, khung web/api/eval/synth).
- 2026-10-29: chốt NestJS + BullMQ (ADR 0001 viết lại); roadmap theo lộ trình học mức middle; thêm `docs/learning/` và chế độ dạy (plan 01).
- 2026-11-01: plan 02 merge (PR #1); plan 03 build packages ra `dist/` + typed lint (ADR 0003).
- 2026-11-02: plan 04 config env bằng `@nestjs/config` + Zod, merge (PR #3).
- 2026-11-02: plan 05 Drizzle + token `DB` + bảng `staff` + `GET /staff`, đủ tiêu chí.

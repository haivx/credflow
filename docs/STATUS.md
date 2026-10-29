# STATUS

> Claude Code đọc file này đầu mỗi phiên và cập nhật cuối phiên (`/wrap`). Giữ ngắn, dưới 40 dòng.

**Cập nhật:** 2026-10-29
**Phase hiện tại:** P0 · Nền tảng và contract (`docs/roadmap.md`)

## Đang làm

- Plan 02 (`docs/plans/02-nest-api-skeleton.md`), đã duyệt, nhánh `feat/02-nest-api-skeleton`. Boilerplate xong (Nest 12 ESM + SWC + Vitest, Redis trong compose), **chưa commit**. Chưa kiểm Redis vì Docker daemon tắt.

## Đang học

> Claude cập nhật sau **mỗi bước**, không chờ cuối phiên. Mở phiên mới gõ `/tiep` để làm tiếp.

- **Mục 🎓:** Module, controller, provider, DI trong Nest (plan 02, 6 bước).
- **Bước đã xong:** chưa có (vừa giải thích bước 1).
- **Bước tiếp theo:** bước 1 `apps/api/src/app.module.ts` (module gốc rỗng) + bước 2 `src/main.ts`.
- **Code đang dở / câu hỏi còn treo:** `apps/api/src/` đang trống, nên `make dev-api` chưa chạy được cho đến khi xong bước 2.

## Tiếp theo

1. Plan 02: dựng `apps/api` bằng NestJS (`main.ts` + `worker.ts`, SWC), thêm Redis vào docker compose (ADR 0001). Mục 🎓 đầu tiên: module / controller / provider.
2. Liam review và chốt contract bản nháp trong `packages/contracts/src/`.
3. Liam chốt quyết định còn mở ở `docs/product.md` mục 8 (mục 1, 4).
4. Drizzle + schema DB + migration; seed staff giả lập.

## Vướng / câu hỏi mở

- (chưa có)

## Eval mới nhất

- Chưa có (bắt đầu từ P2).

## Nhật ký

- 2026-10-27: tạo skeleton (docs, contract nháp, rule engine stub, khung web/api/eval/synth).
- 2026-10-29: chốt NestJS + BullMQ (ADR 0001 viết lại); roadmap theo lộ trình học mức middle; thêm `docs/learning/` và chế độ dạy (plan 01).

# STATUS

> Claude Code đọc file này đầu mỗi phiên và cập nhật cuối phiên (`/wrap`). Giữ ngắn, dưới 40 dòng.

**Cập nhật:** 2026-10-29
**Phase hiện tại:** P0 · Nền tảng và contract (`docs/roadmap.md`)

## Đang làm

- (chưa có)

## Đang học

> Claude cập nhật sau **mỗi bước**, không chờ cuối phiên. Mở phiên mới gõ `/tiep` để làm tiếp.

- **Mục 🎓:** (chưa có)
- **Bước đã xong:** —
- **Bước tiếp theo:** —
- **Code đang dở / câu hỏi còn treo:** —

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

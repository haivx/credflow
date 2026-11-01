# STATUS

> Claude Code đọc file này đầu mỗi phiên và cập nhật cuối phiên (`/wrap`). Giữ ngắn, dưới 40 dòng.

**Cập nhật:** 2026-11-01
**Phase hiện tại:** P0 · Nền tảng và contract (`docs/roadmap.md`)

## Đang làm

- Plan 02 (`docs/plans/02-nest-api-skeleton.md`), đã duyệt, nhánh `feat/02-nest-api-skeleton`. Bước 1–6 đã commit (`a735697`). Đã kiểm Redis (`noeviction`, không AOF): plan 02 đủ tiêu chí.

## Đang học

> Claude cập nhật sau **mỗi bước**, không chờ cuối phiên. Mở phiên mới gõ `/tiep` để làm tiếp.

- **Mục 🎓:** Module, controller, provider, DI trong Nest (plan 02, 6 bước).
- **Bước đã xong:** 1 `app.module.ts` (`@Module`), 2 `main.ts` (top-level await cho `create` + `listen`, bind `127.0.0.1:8787`). Đã học: decorator gắn metadata; floating promise / unhandled rejection; đọc `EADDRINUSE` bằng `lsof`.
  3 `health/health.controller.ts` (`@Controller("health")` + `@Get()`) + `health.module.ts`, `GET /health` trả 200. Đã học: đọc log `RoutesResolver`/`RouterExplorer`; quên khai báo controller thì không lỗi, chỉ mất route (404).
  4 `app-info/app-info.service.ts` + `app-info.module.ts` (providers + exports), inject vào `HealthController`, `/health` trả 200. Đã học: 3 tầng providers/exports/imports, `UnknownExportException`; tên tham số constructor không ảnh hưởng DI (Nest đọc kiểu); `import` ESM khác `imports` của `@Module`; provider khai báo ở một module sở hữu rồi export (khai báo lặp ở nhiều module → nhiều instance, hỏng với pool DB/cache).
  5 `worker.ts` + `worker.module.ts`: `createApplicationContext`, `ctx.get(AppInfoService)` chạy đúng. Đã học: token của provider là chính class (chuỗi → `UnknownElementException`, và `get` trả `any`).
  6 `health/health.controller.spec.ts`: helper `createController(info)` + `useValue`, 2 test (giá trị từ bản giả; spread không cho service ghi đè `status`, đã thử đảo spread → đỏ). Đã học: class vừa là giá trị vừa là kiểu; SWC không kiểm type nên cần cả `make test` + `make typecheck`.
- **Bước tiếp theo:** mục 🎓 xong, chờ Liam tự tick ở `progress.md` (note: `docs/learning/notes/p0-nest-di.md`). Plan 02 xong, chờ merge rồi `/next` sang plan 03.
- **Code đang dở / câu hỏi còn treo:** không có code dở. Đề xuất sau: bật `no-floating-promises` (cần ESLint có type-check).

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

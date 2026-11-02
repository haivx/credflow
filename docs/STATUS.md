# STATUS

> Claude Code đọc file này đầu mỗi phiên và cập nhật cuối phiên (`/wrap`). Giữ ngắn, dưới 40 dòng.

**Cập nhật:** 2026-11-01
**Phase hiện tại:** P0 · Nền tảng và contract (`docs/roadmap.md`)

## Đang làm

- Plan 02, 03 xong, đã merge (PR #1, #2).
- Plan 04 (`docs/plans/04-config-env-zod.md`), nhánh `feat/04-config-env-zod`: config env bằng `@nestjs/config` + Zod. Đủ tiêu chí, chưa commit/PR. Thêm `make format`.

## Đang học

> Claude cập nhật sau **mỗi bước**, không chờ cuối phiên. Mở phiên mới gõ `/tiep` để làm tiếp.

- **Mục 🎓:** Config từ env validate bằng Zod (plan 04, 5 bước) — xong.
- **Bước đã xong:** 1 `config/env.schema.ts` (`envSchema` + `type Env`). Đã học: env luôn là chuỗi → `coerce`; `default` chỉ áp khi `undefined`, chuỗi rỗng `""` không phải `undefined` (`API_PORT=` → 0, `KEY=` lỗi với `.optional()`); ràng buộc cổng `.int().min(1).max(65535)`.
  2 `config/env.schema.spec.ts`, 9 test (`it.each` cho các case cổng). Đã học: `safeParse` không throw (khác `parse`); kiểm `issues[].path` thay vì chỉ `success`; test không thể đỏ là vô giá trị.
  3 `config/config.options.ts` (`ConfigModuleOptions`, `isGlobal`, `envFilePath` 4 cấp bằng `import.meta.dirname`, `validationSchema: envSchema`), `ConfigModule.forRoot` trong `AppModule` + `WorkerModule`; worker và `/health` chạy được. Đã học: `forRoot` là dynamic module; `__dirname` không có trong ESM (tsc vẫn xanh vì `@types/node`); đường dẫn tương đối theo cwd; Nest bỏ qua `.env` không tồn tại nên lỗi hiện ra là lỗi Zod.
  4 `main.ts`: `app.get<ConfigService<Env, true>>`, `get(..., { infer: true })` cho `API_PORT`/`API_HOST`. Đã học: thiếu `infer` → `any` (tên key vẫn được kiểm); `import type`.
  5 Kiểm fail-fast: `DATABASE_URL=` → API và worker exit 1; `API_PORT=9000` → nghe 9000. Đã học: biến môi trường thật thắng `.env`.
- **Bước tiếp theo:** Liam tự tick ở `progress.md` (note: `docs/learning/notes/p0-config-env.md`). Commit + PR plan 04, rồi `/next` (dự kiến Drizzle + token `DB`).
- **Code đang dở / câu hỏi còn treo:** Mục 🎓 "Nest DI" (plan 02) chờ Liam tự tick.

## Tiếp theo

1. Liam review và chốt contract bản nháp trong `packages/contracts/src/`.
2. Liam chốt quyết định còn mở ở `docs/product.md` mục 8 (mục 1, 4).
3. Drizzle + schema DB + migration; seed staff giả lập.

## Vướng / câu hỏi mở

- (chưa có)

## Eval mới nhất

- Chưa có (bắt đầu từ P2).

## Nhật ký

- 2026-10-27: tạo skeleton (docs, contract nháp, rule engine stub, khung web/api/eval/synth).
- 2026-10-29: chốt NestJS + BullMQ (ADR 0001 viết lại); roadmap theo lộ trình học mức middle; thêm `docs/learning/` và chế độ dạy (plan 01).
- 2026-11-01: plan 02 merge (PR #1); plan 03 build packages ra `dist/` + typed lint (ADR 0003).
- 2026-11-02: plan 04 config env bằng `@nestjs/config` + Zod, đủ tiêu chí.

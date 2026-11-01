# 02 · Dựng `apps/api` bằng NestJS (HTTP + worker) và thêm Redis

Phase: P0 · Trạng thái: Đã duyệt · Ngày: 2026-10-29

## Mục tiêu

Thay khung Hono bằng NestJS theo ADR 0001: một codebase, hai entrypoint (`main.ts` mở HTTP, `worker.ts` không mở cổng), build và chạy dev bằng SWC, test bằng Vitest + `unplugin-swc`. Docker compose có Redis `noeviction`. Xong plan này thì `make dev` chạy API Nest với `GET /health`, và Liam đã tự viết module, controller, provider đầu tiên.

## Phạm vi

- Trong:
  - Boilerplate Nest + SWC + Vitest cho `apps/api`.
  - Redis 7 trong docker compose, `Makefile` bật cả Postgres lẫn Redis.
  - 🎓 Module, controller, provider, DI: `AppModule`, `HealthModule`, `GET /health`, một provider inject vào controller, `worker.ts` khởi động bằng application context.
  - Unit test controller bằng `Test.createTestingModule`.
- Ngoài (plan sau):
  - Drizzle, token `DB`, schema, migration (custom provider để plan sau).
  - Config env validate bằng Zod.
  - `GET /ready` (kiểm Postgres + Redis), `GET /staff`.
  - BullMQ queue/processor (P1). `worker.ts` ở plan này chưa có processor.
  - Zod pipe, exception filter.

## Thay đổi

### Phần Claude làm (boilerplate)

| File / module | Thay đổi |
| --- | --- |
| `apps/api/package.json` | Bỏ `hono`, `@hono/node-server`, `tsx`. Thêm `@nestjs/core`, `@nestjs/common`, `@nestjs/platform-express` (^12.3), `reflect-metadata`, `rxjs`; dev: `@nestjs/cli`, `@nestjs/testing`, `@swc/core`, `@swc/cli` (0.8.1, bản 0.8.2 mới hơn ngưỡng tuổi phát hành của pnpm), `vitest`, `unplugin-swc`. Script: `dev`, `dev:worker`, `build`, `start`, `start:worker`, `test`, `typecheck`. **Giữ `"type": "module"`** (xem Rủi ro 2). |
| `apps/api/nest-cli.json` | `builder: "swc"`, `typeCheck: false` (typecheck chạy riêng bằng `tsc`). Không cần `.swcrc`: builder SWC của Nest 12 tự bật decorator metadata và tự chọn ESM theo `package.json`. |
| `apps/api/tsconfig.json`, `tsconfig.build.json` | `module`/`moduleResolution: "nodenext"`, `target: ES2023`, `experimentalDecorators`, `emitDecoratorMetadata`. `tsconfig.build.json` loại `*.spec.ts` khỏi `dist/`. |
| `apps/api/vitest.config.ts` | Plugin `unplugin-swc` để test giữ được decorator metadata; chỉ chạy `src/**/*.spec.ts`. |
| `apps/api/src/index.ts` | Xoá (thay bằng `main.ts`). |
| `eslint.config.mjs` | `no-extraneous-class` cho phép class rỗng có decorator (module Nest) trong `apps/api`. |
| `pnpm-workspace.yaml` | `allowBuilds: '@swc/core': false`. Binary SWC đến từ optional dependency, không cần chạy postinstall. |
| `docker-compose.yml` | Thêm service `redis` (`redis:7`, `127.0.0.1:6379`, `command: redis-server --maxmemory-policy noeviction --appendonly no`). |
| `Makefile` | `db-up` → `docker compose up -d db redis`. `dev` chạy 3 tiến trình: api, worker, web (thêm `dev-worker`). |
| `CLAUDE.md` mục Lệnh | Cập nhật theo Makefile. |
| `pnpm-lock.yaml` | Cập nhật theo deps mới. |

### Phần Liam tự code (🎓 module / controller / provider / DI)

Mỗi bước Claude giải thích trước, Liam viết, Claude review rồi mới sang bước sau.

| Bước | File | Viết gì |
| --- | --- | --- |
| 1 | `src/app.module.ts` | Module gốc rỗng `@Module({})`. Hiểu module là gì, vì sao Nest cần một module gốc. |
| 2 | `src/main.ts` | `import "reflect-metadata"`, `NestFactory.create(AppModule)`, `listen(8787, "127.0.0.1")`. Chạy `make dev-api` thấy log. ESM: import tương đối phải có đuôi `.js` (`./app.module.js`), và dùng được `await` ở top-level. |
| 3 | `src/health/health.controller.ts`, `src/health/health.module.ts` | `@Controller("health")` + `@Get()` trả `{ status: "ok" }`. Đăng ký `HealthModule` vào `AppModule.imports`. |
| 4 | `src/app-info/app-info.service.ts`, `src/app-info/app-info.module.ts` | `@Injectable() AppInfoService` trả `{ service: "api", version }`. Module export service; `HealthModule` import module đó; controller nhận service qua constructor. Hiểu `providers` / `exports` / `imports`, và lỗi "Nest can't resolve dependencies" khi quên export. |
| 5 | `src/worker.ts` | `NestFactory.createApplicationContext(WorkerModule)`, log "worker started", không mở cổng. `src/worker.module.ts` import `AppInfoModule` để thấy provider dùng chung giữa hai entrypoint. |
| 6 | `src/health/health.controller.spec.ts` | `Test.createTestingModule`, thay `AppInfoService` bằng `useValue` giả, gọi thẳng method của controller. Hiểu vì sao DI làm test dễ. |

`GET /health` trả: `{ status: "ok", service: "api", version: "0.0.0" }` (giữ format như khung Hono hiện tại).

## Contract / config / prompt bị ảnh hưởng

- Không đổi `packages/contracts`, `packages/rules`, `config/rules/`, prompt hay model.
- Không đổi schema DB (chưa có DB trong plan này).

## Test và cách kiểm tra

- Unit test: `health.controller.spec.ts` (bước 6), chạy trong `make test`.
- `make typecheck`, `make lint` pass.
- Kiểm tra tay:
  - `make setup` trên working tree sạch: Postgres và Redis đều lên (`docker compose ps`).
  - `docker compose exec redis redis-cli CONFIG GET maxmemory-policy` → `noeviction`.
  - `make dev` → `curl http://127.0.0.1:8787/health` trả JSON đúng; log worker hiện "worker started" và không có cổng nào mở thêm.
  - Sửa một file trong `src/` → API tự reload.
- Eval: không cần (không đụng prompt/model/rule).

## Tiêu chí xong

- [x] `apps/api` không còn Hono / `tsx`; dev và build chạy bằng SWC qua Nest CLI.
- [x] `GET /health` trả `{ status, service, version }`, `version` lấy từ `AppInfoService`.
- [x] `worker.ts` khởi động được bằng application context, không lắng nghe HTTP.
- [x] Redis chạy trong docker compose với `noeviction`, không AOF. (Kiểm 2026-11-01: `CONFIG GET` ra `noeviction` / `appendonly no`.)
- [x] `make test`, `make typecheck`, `make lint` pass; có ít nhất 1 unit test dùng `Test.createTestingModule`.
- [x] `docs/learning/progress.md`: điền `code:` và `note:` cho dòng "Module, controller, provider, DI trong Nest" (Liam tự tick).
- [x] `docs/STATUS.md` và mục Lệnh trong `CLAUDE.md` cập nhật.

## Rủi ro / câu hỏi

1. **Import package workspace dạng `.ts` (cần Liam chọn).** `packages/contracts` và `packages/rules` export thẳng `./src/index.ts`. API build bằng SWC ra `dist/` rồi chạy bằng `node`, nên lúc chạy `node` sẽ không đọc được file `.ts` trong `node_modules`. Plan này chưa import hai package đó, nhưng plan 03 (config Zod) sẽ cần. Các cách:
   - **(a) Đề xuất:** thêm bước `build` bằng `tsc` cho `contracts` và `rules` ra `dist/`, `exports` trỏ vào `dist` (giữ `types` trỏ `src` khi dev). Cách phổ biến, chạy được cả khi deploy. Đổi `package.json` của hai package, cần Liam duyệt vì đụng `packages/contracts`.
   - (b) Để SWC của Nest biên dịch luôn code của package workspace. Ít file hơn nhưng phá ranh giới package.
   - Đề xuất: plan này để (a) sang plan 03, chỉ ghi rủi ro ở đây.
2. **ESM / CommonJS (đã đổi khi làm, 2026-10-29).** Bản nháp định chuyển `apps/api` sang CommonJS. Khi tra docs thì thấy Nest 12 (ra 2026-08) đã lấy **ESM + Vitest** làm mặc định cho project mới, CommonJS chỉ còn là lựa chọn phụ. Repo vốn đã là ESM, nên giữ ESM sẽ ít lệch nhất. Đã kiểm bằng file nháp: build SWC, DI trong test, HTTP, `createApplicationContext` đều chạy.
3. **Version.** Đã tra Context7 (docs NestJS, recipe SWC, migration guide v12). Vitest giữ ^4.1 cho khớp `packages/rules`.

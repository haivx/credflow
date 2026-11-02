# 04 · Config từ env validate bằng Zod (`@nestjs/config`)

Phase: P0 · Trạng thái: Xong · Ngày: 2026-11-01

## Context

`main.ts` đang viết cứng `8787` / `127.0.0.1`, chưa chỗ nào đọc `process.env`. Các bước tiếp theo của P0 (Drizzle cần `DATABASE_URL`, `/ready` cần `REDIS_URL`) đều cần config. Plan này đưa config vào DI của Nest bằng `@nestjs/config` (Liam chọn để học hệ sinh thái Nest dùng ở production), validate bằng Zod lúc khởi động: thiếu hoặc sai biến thì API và worker **không khởi động**, in hết các biến lỗi.

Đã kiểm docs (Context7, `@nestjs/config` 12.0.1, phát hành 2026-09-22, peer `@nestjs/common ^12`):
- `validationSchema` nhận thẳng schema Standard Schema, Zod 4 dùng được, không cần viết hàm `validate`. Lỗi in dạng `PATH: message`, báo **mọi** biến lỗi, bỏ qua biến lạ (`PATH`, `HOME`).
- `ConfigService` trả giá trị **sau khi** schema parse (`z.coerce.number()` cho ra number).
- `@nestjs/config` dùng **dotenv** bên trong (`envFilePath`) → đúng lựa chọn "dotenv" của Liam, không cần thêm `dotenv` làm dependency trực tiếp.

## Phạm vi

- Trong: schema env, `ConfigModule.forRoot` cho cả API lẫn worker, `main.ts` lấy host/port từ `ConfigService`, unit test schema, cập nhật `.env.example`.
- Ngoài: dùng config cho DB/Redis (plan Drizzle, `/ready`); `registerAs` / namespace config; config YAML của rule (P3).

## Biến env

| Biến | Kiểu Zod | Mặc định | Ghi chú |
| --- | --- | --- | --- |
| `API_HOST` | `z.string()` | `127.0.0.1` | mới |
| `API_PORT` | `z.coerce.number().int().min(1).max(65535)` | `8787` | |
| `DATABASE_URL` | `z.url()` | bắt buộc | |
| `REDIS_URL` | `z.url()` | bắt buộc | mới, `redis://localhost:6379` |
| `DATA_DIR` | `z.string().min(1)` | `./data` | |
| `ANTHROPIC_API_KEY` | `z.string().min(1).optional()` | — | optional đến P1 |

`WEB_PORT` để nguyên trong `.env.example` (Next đọc, không thuộc schema API).

## Thay đổi

### Claude làm (boilerplate)

| File | Thay đổi |
| --- | --- |
| `apps/api/package.json`, `pnpm-lock.yaml` | Thêm `@nestjs/config@^12.0.1`, `zod@4.6.5` (cùng bản với `packages/contracts`). |
| `.env.example` | Thêm `API_HOST`, `REDIS_URL`; chú thích biến nào bắt buộc. |
| `docs/learning/notes/p0-config-env.md`, `progress.md`, `STATUS.md` | Note + điền `code:`/`note:` (Liam tự tick). |

### Liam tự code (🎓 Config từ env validate bằng Zod)

Mỗi bước: Claude giải thích ngắn → Liam viết → Claude review.

| Bước | File | Viết gì / học gì |
| --- | --- | --- |
| 1 | `apps/api/src/config/env.schema.ts` | `envSchema = z.object({...})` theo bảng trên, `export type Env = z.infer<typeof envSchema>`. Học: env luôn là string → `coerce`; `default` vs `optional` vs bắt buộc. |
| 2 | `apps/api/src/config/env.schema.spec.ts` | Test `envSchema.safeParse`: đủ biến → port là number, default được điền; thiếu `DATABASE_URL` → lỗi; `API_PORT=abc` → lỗi. Không cần Nest. |
| 3 | `apps/api/src/config/config.options.ts`, `app.module.ts`, `worker.module.ts` | Một object options dùng chung: `{ isGlobal: true, envFilePath: <.env ở gốc repo>, validationSchema: envSchema }`; cả hai root module `ConfigModule.forRoot(...)`. Học: `forRoot` là **dynamic module**; `isGlobal`; vì sao `envFilePath` phải chỉ về gốc repo (pnpm `--filter` chạy với cwd `apps/api`) — dùng `import.meta.dirname` thay vì đường dẫn tương đối theo cwd. |
| 4 | `apps/api/src/main.ts` | `app.get(ConfigService<Env, true>)` → `get("API_PORT", { infer: true })`, `get("API_HOST", ...)`, listen + log đúng địa chỉ. Học: generic thứ hai `true` (đã validate → không trả `undefined`); lấy provider ngoài constructor bằng `app.get`. |
| 5 | Kiểm tra fail-fast | Xoá `DATABASE_URL` khỏi `.env` → `make dev-api` và `make dev-worker` đều dừng, in lỗi Zod. Đổi `API_PORT=9000` → API nghe 9000. Đọc stack trace để thấy lỗi ném ra lúc bootstrap. |

## Contract / config / prompt bị ảnh hưởng

Không đổi `packages/contracts`, rule, prompt, model, schema DB. Schema env là nội bộ `apps/api`.

## Test và cách kiểm tra

- Unit test: `env.schema.spec.ts` (≥ 3 case ở bước 2), chạy trong `make test`.
- `make typecheck`, `make lint` pass.
- Tay: bước 5; `curl http://127.0.0.1:8787/health` vẫn 200; `.env` không bị commit (`git status`).
- Eval: không cần.

## Tiêu chí xong

- [x] Không còn `8787` / `127.0.0.1` viết cứng trong `apps/api/src` (chỉ còn ở default của schema và test).
- [x] Thiếu biến bắt buộc hoặc sai kiểu → API **và** worker không khởi động, lỗi nêu tên biến. (Kiểm 2026-11-02: `DATABASE_URL=` → cả hai exit 1; `API_PORT=abc REDIS_URL=` → báo cả hai biến; `API_PORT=9000` → `/health` 200 ở 9000.)
- [x] `ConfigService` có kiểu (`ConfigService<Env, true>`), `get` với key không có trong `Env` báo lỗi `tsc`.
- [x] `make test`, `make typecheck`, `make lint` pass.
- [x] `.env.example` đủ biến; `progress.md` điền `code:`/`note:`; `STATUS.md` cập nhật.

## Rủi ro / câu hỏi

1. Nest docs thường dùng `ConfigModule` thẳng mà không qua wrapper module; plan giữ cách đó (object options dùng chung), không tạo `AppConfigModule` riêng.
2. Worker chưa dùng config nào, nhưng vẫn validate để fail-fast giống API (P1 worker cần `REDIS_URL`, `ANTHROPIC_API_KEY`).
3. Chưa cần ADR: dùng `@nestjs/config` nằm trong stack Nest đã chốt (ADR 0001). Ghi lý do vào note học.

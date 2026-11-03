# 06 · `/ready` + DB test + integration test đầu tiên

Phase: P0 · Trạng thái: Xong · Ngày: 2026-11-02

## Context

P0 còn ba tiêu chí chưa đạt: `/ready` trả lỗi khi tắt Redis, có ít nhất 1 integration test với Postgres thật, test ràng buộc DB. Hai tiêu chí đầu không phụ thuộc contract chưa chốt, nên làm trước. Plan này cũng dựng hạ tầng integration test mà plan sau (bảng `documents`, test ràng buộc, Zod pipe, exception filter) sẽ dùng lại.

Quyết định đã chốt (Liam, 2026-11-02):
1. Redis client: `ioredis` (BullMQ ở P1 dùng được nó, không học thêm client thứ hai).
2. DB test: service `db-test` riêng trong docker compose, cổng `5433`, dữ liệu trên `tmpfs` (bật lại là trống, không đụng dữ liệu dev).
3. Integration test chạy bằng `make test-int`; `make test` giữ là unit test, không cần docker.
4. Test "Redis chết": override provider `REDIS` bằng client trỏ tới cổng không có Redis, không `docker stop` trong lúc test.

Đã kiểm docs (Context7 + npm, 2026-11-02):
- Bản ổn định: `ioredis@6.0.0` (6.1 vẫn beta), `supertest@7.3.1`, `@types/supertest@7.2.1`. `bullmq@6` nhận `ioredis >=5` làm peer dependency.
- ioredis mặc định **xếp hàng lệnh khi chưa kết nối** (offline queue) và thử lại kết nối mãi (`retryStrategy`, backoff tối đa 5s). Redis chết thì `ping()` có thể treo rất lâu, không lỗi ngay. Vì vậy `/ready` phải tự có timeout. Cấu hình ioredis chọn ở bước 1.
- `maxRetriesPerRequest` (mặc định 20): số lần reconnect trước khi các lệnh đang chờ bị trả lỗi `MaxRetriesPerRequestError`. BullMQ yêu cầu `null` cho connection của worker. Đó là connection riêng ở P1, không dùng chung client của `/ready`.

## Phạm vi

- Trong: `RedisModule` (token `REDIS`), `GET /ready` (Postgres + Redis, có timeout, `503` khi lỗi), unit test cho ready, service `db-test`, `make test-int`, vitest config riêng cho integration test (chạy migration lên DB test), supertest, integration test cho `GET /staff` và `GET /ready`.
- Ngoài: bảng `documents`/`review_actions` và test ràng buộc (plan 07, sau khi chốt contract); Zod pipe, exception filter, format lỗi `{ code, message, details? }` (plan 07); BullMQ, worker dùng Redis (P1); CI.

## `GET /ready`

| Trạng thái | HTTP | Body |
| --- | --- | --- |
| Postgres và Redis đều trả lời trong 1s | `200` | `{ "status": "ok", "checks": { "db": "up", "redis": "up" } }` |
| Ít nhất một bên lỗi hoặc quá 1s | `503` | `{ "status": "error", "checks": { "db": "up", "redis": "down" } }` |

- Postgres: `SELECT 1` qua `DB`. Redis: `PING` qua `REDIS`. Chạy song song, mỗi check có timeout riêng 1000ms (hằng số trong code, chưa đưa ra env).
- Body không chứa message lỗi gốc (không lộ host/cổng); lỗi chi tiết ghi log.
- `/health` giữ nguyên: không đụng DB/Redis, luôn `200` khi process còn sống.

## Thay đổi

### Claude làm (boilerplate)

| File | Thay đổi |
| --- | --- |
| `apps/api/package.json`, `pnpm-lock.yaml` | Thêm `ioredis@^6.0.0`; dev: `supertest@^7.3.1`, `@types/supertest@^7.2.1`. Script `test:int`. |
| `docker-compose.yml` | Service `db-test`: `postgres:16`, `127.0.0.1:5433:5432`, `POSTGRES_DB=credflow_test`, `tmpfs: /var/lib/postgresql/data`, healthcheck `pg_isready`. Thêm healthcheck `redis-cli ping` cho `redis` (để `docker compose up --wait` chờ được). |
| `Makefile`, `CLAUDE.md` (mục Lệnh) | `make test-int`: `build-packages` → `docker compose up -d --wait db-test redis` → `pnpm --filter @credflow/api test:int`. `make db-down` vẫn tắt hết. |
| `apps/api/vitest.int.config.ts` | `include: ["test/**/*.int-spec.ts"]`, `env` đặt `DATABASE_URL` tới DB test (cổng 5433) và `REDIS_URL`, `fileParallelism: false` (các file test dùng chung một DB), `globalSetup`. Dùng plugin SWC như `vitest.config.ts`. |
| `apps/api/test/global-setup.ts` | Chặn chạy nếu `DATABASE_URL` không phải DB test (vì test sẽ xoá bảng); chạy migration bằng `migrate()` của `drizzle-orm/node-postgres/migrator` với `apps/api/drizzle/`. |
| `apps/api/src/redis/redis.provider.ts`, `redis.module.ts` | Scaffold giống `DbModule`: `REDIS = Symbol("REDIS")`, `useFactory` tạo `new Redis(REDIS_URL, {...})`, `on("error")` ghi log (tránh crash như pool ở plan 05), `quit()` trong `onApplicationShutdown`. Option ioredis để Liam chọn ở bước 1. |
| `docs/learning/notes/p0-ready-integration-test.md`, `progress.md`, `STATUS.md` | Note + điền `code:`/`note:` cho "`/health` và `/ready`", "Integration test với Postgres thật" (Liam tự tick). |

### Liam tự code (🎓 `/health` và `/ready`, Integration test với Postgres thật)

Mỗi bước: Claude giải thích ngắn → Liam viết → Claude review.

| Bước | File | Viết gì / học gì |
| --- | --- | --- |
| 1 | `apps/api/src/redis/redis.provider.ts` (đọc scaffold, chọn option) | Thử: Redis tắt thì `ping()` với option mặc định làm gì? Chọn `enableOfflineQueue`, `maxRetriesPerRequest`, `connectTimeout`. Học: offline queue, reconnect của ioredis; vì sao client cho `/ready` cần "fail nhanh". |
| 2 | `apps/api/src/health/ready.service.ts` | `checkDb()` (`db.execute(sql\`select 1\`)`), `checkRedis()` (`redis.ping()`), hàm `withTimeout(promise, ms)`, chạy song song bằng `Promise.allSettled`. Học: `Promise.race` cho timeout và vì sao nó không huỷ được promise gốc; `allSettled` khác `all` ở đâu. |
| 3 | `apps/api/src/health/ready.controller.ts`, `health.module.ts` | `GET /ready` trả `200`, lỗi thì ném `ServiceUnavailableException(body)` để ra `503`. Import `DbModule`, `RedisModule`. Học: `/health` (liveness) khác `/ready` (readiness), hệ thống deploy dùng mỗi cái làm gì; vì sao `/health` không được gọi DB. |
| 4 | `apps/api/src/health/ready.service.spec.ts` | Unit test với `DB`/`REDIS` giả: cả hai up; một bên reject; một bên treo quá timeout (dùng fake timers của vitest hoặc timeout nhỏ). |
| 5 | `apps/api/test/staff.int-spec.ts` | `Test.createTestingModule({ imports: [AppModule] })` → `app.init()` → `request(app.getHttpServer())`. `beforeEach`: `TRUNCATE staff`, insert 2 staff; test `GET /staff` trả đúng 2 dòng theo thứ tự `legalName`. `afterAll`: `app.close()`. Học: dựng app thật trong test; dọn dữ liệu giữa các test; vì sao phải đóng app (pool mở làm vitest treo). |
| 6 | `apps/api/test/ready.int-spec.ts` | `GET /ready` → `200` khi Postgres test + Redis chạy. Override `REDIS` bằng client trỏ tới cổng không có Redis (`.overrideProvider(REDIS).useFactory(...)`) → `503`, `checks.redis = "down"`, `checks.db = "up"`, trả về trong khoảng ~1s. Học: `overrideProvider`; test đường lỗi mà không tắt service thật. |

## Contract / config / prompt bị ảnh hưởng

- Không đụng `packages/contracts`, rule, prompt, model. Schema DB không đổi.
- Env: dùng `REDIS_URL` đã có trong `envSchema`, không thêm biến. Integration test đặt `DATABASE_URL`/`REDIS_URL` qua `env` của vitest, không cần `.env` riêng.
- Dependency mới: `ioredis` (runtime), `supertest` (dev).

## Test và cách kiểm tra

- Unit test: `ready.service.spec.ts`, chạy trong `make test` (không cần docker).
- Integration test: `make test-int` (2 file, Postgres thật trên cổng 5433, Redis thật).
- `make typecheck`, `make lint` pass.
- Tay:
  - `make dev-api` → `curl -i 127.0.0.1:8787/ready` trả `200`.
  - `docker compose stop redis` → `/ready` trả `503` trong ~1s, `/health` vẫn `200`, API không crash. `docker compose start redis` → `/ready` về `200` mà không cần restart API.
  - Tương tự với `docker compose stop db`.
  - Dừng API (Ctrl+C) không treo (pool và Redis client đều đóng).
  - `make test-int` chạy 2 lần liên tiếp đều pass (test không phụ thuộc dữ liệu lần trước); `make db-seed` trên DB dev vẫn còn đủ 10 staff sau khi chạy test.
- Eval: không cần.

## Tiêu chí xong

- [x] `GET /ready` trả `200`/`503` đúng bảng trên; tắt Redis thì `503` trong ≤ 2s, API không crash, bật lại tự về `200`.
- [x] `/health` không phụ thuộc DB/Redis.
- [x] `make test-int` chạy integration test trên Postgres test thật (cổng 5433), có test `GET /staff` và `GET /ready` (cả Redis up và down); không đụng dữ liệu DB dev.
- [x] `global-setup.ts` từ chối chạy khi `DATABASE_URL` không phải DB test.
- [x] `make test`, `make typecheck`, `make lint` pass; `make test` không cần docker.
- [x] `CLAUDE.md` mục Lệnh cập nhật; `progress.md` điền `code:`/`note:`; `STATUS.md` cập nhật.

## Rủi ro / câu hỏi

1. `@nestjs/config`: biến môi trường của process thắng giá trị trong `.env`, nên `env` của vitest đè được `DATABASE_URL`. Kiểm lại lúc làm bước 5; nếu không đúng thì truyền qua `ConfigModule` khác cho test (không đổi code app).
2. `withTimeout` bằng `Promise.race` không huỷ `ping()` đang treo; với `enableOfflineQueue: false` thì lệnh fail ngay nên không tích tụ. Nếu vẫn tích tụ thì xem lại option ở bước 1.
3. Worker chưa dùng Redis; `RedisModule` chỉ import vào API. Connection cho BullMQ (cần `maxRetriesPerRequest: null`) tạo riêng ở P1.
4. Kiểm 2026-11-02: tắt Redis/DB → `/ready` 503 ~4ms, `/health` 200, bật lại → 200; `make test-int` 3 test pass, chạy lại vẫn pass; DB dev giữ 10 staff. Test override dùng option `{}` thì `ping()` và `quit()` treo → test timeout (lý do test phải dùng đúng option của app).
5. Drizzle bọc lỗi DB (`Failed query: select 1`), nguyên nhân ở `error.cause`; log `/ready` chưa in `cause` (để sau).
6. Không cần ADR: Redis + ioredis nằm trong stack đã chốt (ADR 0001 ghi BullMQ + Redis); DB test trong compose đúng roadmap. Lý do chọn ghi ở note học.

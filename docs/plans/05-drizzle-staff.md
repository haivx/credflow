# 05 · Drizzle + token `DB` + bảng `staff` + `GET /staff`

Phase: P0 · Trạng thái: Xong · Ngày: 2026-11-02

## Context

P0 cần DB cho `/ready`, integration test và ràng buộc ở DB, nhưng hiện `apps/api` chưa kết nối Postgres. Plan này đưa Drizzle vào Nest qua custom provider (token `DB`), tạo bảng đầu tiên `staff` bằng migration, seed staff giả lập, và mở `GET /staff`.

Chỉ làm `staff`: `StaffProfile` đơn giản và Liam đã chốt. `documents` và `review_actions` phụ thuộc contract chưa chốt (`DocumentStatus`, `versions`, `checksum`, `ReviewAction`), làm sau để không phải sửa migration.

Quyết định đã chốt (Liam, 2026-11-02):
1. Giữ `StaffProfile` như bản nháp → bỏ dòng "BẢN NHÁP" trong `packages/contracts/src/staff.ts`.
2. `aliases`, `clientIds` lưu bằng cột `text[]` của Postgres, không tách bảng.
3. Driver `pg` (node-postgres).
4. `id` là ulid sinh trong code lúc insert (package `ulid`), DB không tự sinh.

Đã kiểm docs (Context7 + npm, 2026-11-02):
- Bản ổn định: `drizzle-orm@0.45.4`, `drizzle-kit@0.31.11` (v1 vẫn là `rc`, không dùng). `pg@8.23.1`, `@types/pg@8.23.1`, `ulid@3.0.2`.
- Kết nối: `drizzle({ client: new Pool({ connectionString }) })` từ `drizzle-orm/node-postgres`.
- Mảng rỗng mặc định: `text().array().notNull().default(sql\`'{}'::text[]\`)`.
- `drizzle-kit generate` đọc schema, so với snapshot cũ, sinh SQL vào `out`; `drizzle-kit migrate` chạy migration chưa áp và ghi lịch sử vào bảng `__drizzle_migrations`.

## Phạm vi

- Trong: deps, `drizzle.config.ts`, `DbModule` (token `DB`, đóng pool khi app tắt), schema `staff`, migration đầu tiên, script seed (idempotent), `StaffModule` + `GET /staff` (response parse bằng `StaffProfile`), lệnh Makefile.
- Ngoài: `documents`, `review_actions`; `CHECK`/FK và test ràng buộc (plan constraints cùng `documents`); `/ready`; DB test riêng + integration test supertest; Zod pipe, exception filter; worker dùng DB (P1).

## Bảng `staff`

| Cột | Kiểu Postgres | Ràng buộc | Map sang `StaffProfile` |
| --- | --- | --- | --- |
| `id` | `text` | PK | `id` (ulid) |
| `legal_name` | `text` | `NOT NULL` | `legalName` |
| `aliases` | `text[]` | `NOT NULL DEFAULT '{}'` | `aliases` |
| `role` | `text` | `NOT NULL` | `role` |
| `client_ids` | `text[]` | `NOT NULL DEFAULT '{}'` | `clientIds` |
| `region` | `text` | `NOT NULL` | `region` |
| `created_at` | `timestamptz` | `NOT NULL DEFAULT now()` | không trả ra API |

## Thay đổi

### Claude làm (boilerplate)

| File | Thay đổi |
| --- | --- |
| `apps/api/package.json`, `pnpm-lock.yaml` | Thêm `drizzle-orm@^0.45.4`, `pg@^8.23.1`, `ulid@^3.0.2`; dev: `drizzle-kit@^0.31.11`, `@types/pg@^8.23.1`, `tsx@^4.23.0`. Script `db:generate`, `db:migrate`, `db:seed`. |
| `apps/api/drizzle.config.ts` | `defineConfig({ dialect: "postgresql", schema: "./src/db/schema.ts", out: "./drizzle", dbCredentials: { url } })`, nạp `.env` gốc repo bằng `process.loadEnvFile` (Node ≥ 20.12, không thêm `dotenv`). |
| `apps/api/scripts/seed-data.ts` | 10 staff giả lập: tên hư cấu, ulid cố định (để seed chạy lại không sinh trùng), có ca `aliases` (đổi họ, tên thường gọi), nhiều `role`/`region`. Theo `docs/data-policy.md`. |
| `Makefile`, `CLAUDE.md` (mục Lệnh) | `make db-generate`, `make db-migrate`, `make db-seed`. |
| `packages/contracts/src/staff.ts` | Bỏ dòng "BẢN NHÁP" (chỉ comment, schema không đổi). |
| `docs/learning/notes/p0-drizzle.md`, `progress.md`, `STATUS.md` | Note + điền `code:`/`note:` (Liam tự tick). |

### Liam tự code (🎓 Custom provider, Drizzle schema và migration)

Mỗi bước: Claude giải thích ngắn → Liam viết → Claude review.

| Bước | File | Viết gì / học gì |
| --- | --- | --- |
| 1 | `apps/api/src/db/schema.ts` | `export const staff = pgTable("staff", {...})` theo bảng trên. Học: tên cột TS (`legalName`) và tên cột DB (`legal_name`); `.notNull()`, `.default(sql\`...\`)`; `typeof staff.$inferSelect` / `$inferInsert`. |
| 2 | Migration | `make db-generate` → đọc SQL sinh ra trong `apps/api/drizzle/`, `make db-migrate` → kiểm bằng `psql` (`\d staff`). Học: snapshot + diff; vì sao commit file migration; vì sao không sửa DB bằng tay; bảng `__drizzle_migrations`. |
| 3 | `apps/api/src/db/db.module.ts`, `db.provider.ts` | `export const DB = Symbol("DB")`, provider `{ provide: DB, inject: [ConfigService], useFactory: (config) => drizzle({ client: new Pool(...), schema }) }`, `export type Db = ...`; module `exports: [DB]`; đóng pool trong `onApplicationShutdown`. Học: `useFactory` + `inject`; vì sao cần token (Drizzle không phải class Nest tạo được); `@Inject(DB)` ở chỗ dùng. |
| 4 | `apps/api/scripts/seed.ts` | Đọc env qua `envSchema`, tạo pool, `db.insert(staff).values(seedStaff).onConflictDoNothing()`, đóng pool, exit code đúng. Học: seed idempotent (chạy 2 lần vẫn 10 dòng); script Node không cần Nest. |
| 5 | `apps/api/src/staff/staff.{module,service,controller}.ts` | `StaffService` `@Inject(DB)`, `db.select({...}).from(staff).orderBy(staff.legalName)` (không lấy `created_at`); controller `GET /staff` trả `StaffProfile.array().parse(rows)`. Đăng ký `StaffModule` + `DbModule` trong `AppModule`. Học: select cột cụ thể; vì sao parse response ở ranh giới. |
| 6 | `apps/api/src/staff/staff.controller.spec.ts` | Test controller với `StaffService` giả (giống `health.controller.spec.ts`): trả đúng dữ liệu; row sai shape (vd thiếu `region`) → ném lỗi Zod. |

## Contract / config / prompt bị ảnh hưởng

- `packages/contracts/src/staff.ts`: chỉ bỏ comment "BẢN NHÁP", `StaffProfile` giữ nguyên (Liam đã chốt).
- Schema DB: thêm bảng `staff` (migration đầu tiên). Không đụng rule, prompt, model.
- Env: dùng `DATABASE_URL` đã có, không thêm biến.

## Test và cách kiểm tra

- Unit test: `staff.controller.spec.ts` (bước 6), chạy trong `make test`.
- `make typecheck`, `make lint` pass.
- Tay:
  - Máy sạch: `make db-up && make db-migrate && make db-seed` → `psql` thấy 10 dòng; chạy `make db-seed` lần 2 vẫn 10 dòng.
  - `make dev-api` → `curl http://127.0.0.1:8787/staff` trả 10 staff đúng shape `StaffProfile`, `aliases`/`clientIds` là mảng JSON.
  - Tắt Postgres (`docker compose stop db`) → `GET /staff` lỗi 500, API không crash; bật lại thì chạy tiếp (chưa có exception filter, format lỗi để plan sau).
  - Dừng API (Ctrl+C) không treo vì pool chưa đóng.
- Integration test với Postgres thật: để plan sau (cần DB test riêng).
- Eval: không cần.

## Tiêu chí xong

- [x] `make db-migrate` trên DB trống tạo bảng `staff` đúng bảng trên (`\d staff`); file migration được commit. (Kiểm 2026-11-02 trên DB tạm `credflow_check`.)
- [x] `make db-seed` idempotent: chạy 2 lần vẫn đúng 10 dòng. (Lần 1 inserted 10, lần 2 inserted 0; sai mật khẩu exit 1.)
- [x] `GET /staff` trả `StaffProfile[]`, response đã parse bằng Zod. Tắt DB → `/staff` 500, `/health` 200, bật lại tự chạy tiếp (sau khi thêm `pool.on("error")`).
- [x] Service lấy DB qua `@Inject(DB)`, không tự tạo `Pool` ở đâu khác ngoài provider (và script seed).
- [x] `make test`, `make typecheck`, `make lint` pass.
- [x] `CLAUDE.md` mục Lệnh cập nhật; `progress.md` điền `code:`/`note:`; `STATUS.md` cập nhật.

## Rủi ro / câu hỏi

1. `drizzle-kit` chạy file `drizzle.config.ts` bằng loader riêng; nếu `process.loadEnvFile` hoặc ESM gây lỗi thì truyền `DATABASE_URL` qua script npm. Không cần ADR.
2. Seed dùng `tsx` (giống `eval/`, `tools/synth/`): được, vì seed không dùng DI của Nest.
3. `text[]` không có FK tới `clients`. Chấp nhận cho MVP (chưa có bảng `clients`); khi cần FK thì tách bảng nối, ghi ADR lúc đó.
4. Kiểm tay 2026-11-02 phát hiện: tắt Postgres làm API crash (`Pool` phát `'error'` từ kết nối idle, không có listener → Node kill process). Sửa: `pool.on("error", ...)` ghi log trong `useFactory`.
5. Chưa cần ADR: Drizzle + Postgres đã nằm trong stack chốt (ADR 0001). Lý do chọn `pg`, `text[]`, ulid trong code ghi ở note học.

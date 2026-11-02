# Drizzle, migration và custom provider token `DB`

Phase: P0 · Code: `apps/api/src/db/`, `apps/api/drizzle/`, `apps/api/drizzle.config.ts`, `apps/api/scripts/seed.ts`, `apps/api/src/staff/` · Plan: `docs/plans/05-drizzle-staff.md`

## Vấn đề

Bảng trong DB và kiểu dữ liệu trong code phải khớp nhau. Viết SQL một nơi, type TS một nơi thì sớm muộn lệch. Ngoài ra object `db` phải dùng chung cả app (một pool), lấy `DATABASE_URL` từ config đã validate, và thay được bằng bản giả khi test.

## Schema → migration

- Khai báo bảng **một lần** bằng TS (`pgTable`). Từ đó có kiểu dòng (`$inferSelect`, `$inferInsert`) và SQL migration.
- Key trong object là tên phía TS (`legalName`), chuỗi trong `text("legal_name")` là tên cột DB.
- `.array()` là method nối sau cột (`text("x").array()` → `text[]`), không phải hàm import. `.default([])` ở 0.45 sinh đúng `DEFAULT '{}'`.
- `drizzle-kit generate` so `schema.ts` với **snapshot** gần nhất trong `drizzle/meta/` (không nhìn DB) rồi sinh SQL cho phần khác. Phải commit cả `.sql` lẫn `meta/`.
- `drizzle-kit migrate` đọc bảng `drizzle.__drizzle_migrations`, chỉ chạy migration chưa áp → chạy lại bao nhiêu lần cũng an toàn.
- **Không sửa DB bằng tay:** snapshot không biết thay đổi đó, máy khác và môi trường deploy cũng không có → **schema drift**.
- Ví dụ trên mạng: nhìn đường dẫn import trước. `.all()`, `drizzle-orm/sqlite-*` là của SQLite; dự án dùng `pg-core` và `node-postgres`.

## Custom provider token `DB`

Nest tự tạo được **class** và inject theo kiểu khai báo (nhờ `emitDecoratorMetadata`, class còn tồn tại lúc chạy nên làm khoá được). Object `db` tạo bằng hàm `drizzle(...)`, kiểu `Db` bị xoá lúc biên dịch → Nest không có khoá để tra → cần token.

```ts
export const DB = Symbol("DB");                      // khoá (giá trị)
export type Db = NodePgDatabase<typeof schema> & { $client: Pool }; // kiểu
export const dbProvider = { provide: DB, inject: [ConfigService], useFactory: (config) => ... };

constructor(@Inject(DB) private readonly db: Db) {} // chỗ dùng
```

- `DB` (giá trị, còn lúc chạy) khác `Db` (kiểu, bị xoá). `db: DB` là lỗi.
- `useFactory` chạy **một lần** (singleton). `inject` liệt kê tham số của `useFactory` theo đúng thứ tự.
- Kiểu thư viện trả về dạng `A & B` thì khai báo lại bằng tay dễ mất `B`: `drizzle()` trả `NodePgDatabase & { $client: Pool }`. Bí thì đọc `.d.ts`.
- `import type` cho thứ chỉ dùng làm kiểu. Trong tham số có decorator (`@Inject`) thì **bắt buộc** (`TS1272`).

**Hai chữ "import" khác nhau:**

| | Làm gì | Thiếu thì |
| --- | --- | --- |
| `import { DB } from "..."` (TS) | Lấy biến từ file khác | `tsc`: `Cannot find name 'DB'` |
| `imports: [DbModule]` (`@Module`) | Cho module dùng provider mà module kia `exports` | Lúc chạy: `Nest can't resolve dependencies of the StaffService (?)` |

`imports` của `@Module` chỉ nhận **module**, không nhận token. Hai phía phải khớp: `DbModule` có `exports: [DB]`, `StaffModule` có `imports: [DbModule]`.

**Script không chạy qua Nest** (`scripts/seed.ts`): không có ai đổi token thành object, nên `DB.insert(...)` sai. Tự tạo `Pool` + `drizzle(...)` và tự đóng pool trong `finally`.

## Pool kết nối

- Cả process có **1 pool**, tạo một lần lúc khởi động. Request HTTP từ FE không tương ứng với connection DB.
- Query mượn một connection, xong trả lại ngay. Hết connection rảnh thì mở thêm đến `max` (mặc định 10), quá nữa thì xếp hàng. Connection rảnh quá 10 giây bị đóng (`idleTimeoutMillis`).
- Vì sao cần pool: mỗi connection Postgres là một process riêng (tốn RAM, tốn thời gian mở), và Postgres giới hạn `max_connections` (dev: 100). Tổng connection = số process (API, worker, ...) × `max`.

**Lỗi connection:**

| Connection lỗi lúc nào | Lỗi đi đâu | Kết quả |
| --- | --- | --- |
| Đang chạy query | Promise của query reject | Request đó 500, app sống |
| Đang rảnh trong pool | Pool phát sự kiện `'error'` | Không có listener → Node kill process |

**Quy tắc EventEmitter:** sự kiện `'error'` không có listener thì Node coi là lỗi chưa xử lý và tắt process. Vì vậy luôn `pool.on("error", ...)` (ghi log, không throw lại; pool tự bỏ connection hỏng). Gặp lại ở stream (P1) và BullMQ worker.

Phát hiện bằng kiểm tay: `docker compose stop db` làm cả API chết, kể cả `/health`. Unit test với service giả không bắt được loại lỗi này.

## Seed chạy lại được

`INSERT ... ON CONFLICT DO NOTHING` với id cố định: một câu SQL, DB đảm bảo không trùng. `.returning()` cho biết bao nhiêu dòng thật sự được insert. Đóng pool trong `finally`; báo lỗi bằng `process.exitCode = 1` thay vì `process.exit(1)` (thoát ngay sẽ cắt ngang `pool.end()`).

## Test controller

- Thay `StaffService` bằng `useValue` giả: lợi ích trực tiếp của DI.
- Tham số dữ liệu test để `unknown[]` để cố ý đưa dữ liệu sai vào (giống thực tế: dữ liệu DB không chắc đúng contract, nên controller mới `parse`).
- `await expect(controller.list()).rejects.toThrow(ZodError)`: đưa Promise **chưa await** vào `expect`, rồi `await` cả câu. `await` lời gọi trước thì lỗi ném ra luôn, test fail.
- `zod/v3` có class `ZodError` riêng. `instanceof` so **chính class**, không so tên → cùng tên khác đường dẫn import vẫn fail.

## Lỗi hay gặp

- IDE tự thêm import sai đường dẫn (`drizzle-orm/prisma/sqlite`, `zod/v3`). Đọc lại dòng import IDE vừa thêm.
- `import x from` cho file chỉ có named export (`TS2613`).
- `staff.legalName.asc()`: `asc` là hàm (`asc(staff.legalName)`), không phải method của cột.
- `drizzle-kit` nạp `drizzle.config.ts` dạng CommonJS nên `import.meta.dirname` là `undefined`; `tsx` chạy ESM nên trong script dùng được.
- `onApplicationShutdown` chỉ chạy khi bật `app.enableShutdownHooks()` (P6).

# Config từ env validate bằng Zod (`@nestjs/config`)

Phase: P0 · Code: `apps/api/src/config/`, `apps/api/src/{app,worker}.module.ts`, `apps/api/src/main.ts` · Plan: `docs/plans/04-config-env-zod.md`

## Vấn đề

`process.env` là `Record<string, string | undefined>`: mọi giá trị là chuỗi, biến nào cũng có thể thiếu. Đọc thẳng `process.env.X` ở chỗ dùng thì lỗi chỉ lộ khi code chạy tới dòng đó, có khi vài giờ sau deploy, và giá trị vẫn là chuỗi (`"8787"`).

## Cách giải và vì sao chọn

- **Một schema, parse một lần lúc khởi động.** Sai thì process dừng ngay (exit 1) và in **mọi** biến lỗi. Parse qua rồi thì cả app dùng giá trị đã đúng kiểu.
- **`@nestjs/config`** thay vì tự viết provider: là cách hệ sinh thái Nest dùng ở production, và từ bản 12 `validationSchema` nhận thẳng schema Standard Schema (Zod 4). Bên trong nó dùng **dotenv** để đọc `envFilePath`.
- `ConfigModule.forRoot(options)` là **dynamic module**: hàm trả về module được cấu hình theo `options` (cùng pattern với `BullModule.forRoot` sau này). `isGlobal: true` để mọi module dùng được `ConfigService` mà không cần import.
- **Biến môi trường thật thắng `.env`:** dotenv không ghi đè biến đã có, nên `API_PORT=9000 node dist/main.js` dùng 9000 dù `.env` ghi 8787. Lúc deploy, env do nền tảng cấp và không cần file `.env`.
- **Kiểu:** `ConfigService<Env, true>` + `get(key, { infer: true })`.

  | Viết | Kiểm tên key | Kiểu trả về |
  | --- | --- | --- |
  | `ConfigService` | không | `any` |
  | `ConfigService<Env, true>` + `get("API_PORT")` | có | `any` |
  | `ConfigService<Env, true>` + `get("API_PORT", { infer: true })` | có | `number` |

  Generic `true` (WasValidated) bỏ `undefined` khỏi kiểu, đúng vì schema đã chặn từ lúc khởi động.
- `main.ts` không phải class nên lấy provider bằng `app.get(...)`, giống `ctx.get(...)` ở worker.

## Zod cho env

| Viết | Thiếu biến | Có biến nhưng rỗng (`X=`) |
| --- | --- | --- |
| `z.url()` | lỗi | lỗi |
| `z.string().min(1).default("./data")` | điền default | lỗi |
| `z.string().min(1).optional()` | `undefined` | lỗi |
| `z.coerce.number().default(8787)` (thiếu ràng buộc) | 8787 | **0** (không lỗi) |

- Env luôn là chuỗi → số phải `z.coerce.number()`. `coerce` biến `""` thành `0`, `"8787.5"` thành 8787.5, nên cổng cần `.int().min(1).max(65535)`.
- `.default()` và `.optional()` chỉ áp cho `undefined`. **Chuỗi rỗng không phải `undefined`.** Vì vậy `.env.example` để `# ANTHROPIC_API_KEY=` dạng comment thay vì dòng trống.
- `safeParse` **không throw**, trả `{ success, data | error }`. `parse` mới throw. Test phải kiểm `result.success` và `result.error?.issues.map(i => i.path)`, không dùng `.toThrow()`.

## Lỗi hay gặp

| Triệu chứng | Nguyên nhân |
| --- | --- |
| `Config validation error: DATABASE_URL: ... must be a valid URL` dù `.env` có biến đó | `envFilePath` sai. Nest **lặng lẽ bỏ qua** file không tồn tại. Đường dẫn tương đối tính theo cwd (`pnpm --filter` chạy ở `apps/api/`), phải dùng `path.resolve(import.meta.dirname, "../../../../.env")`. |
| `ReferenceError: __dirname is not defined` lúc chạy, nhưng `tsc` xanh | `__dirname` chỉ có trong CommonJS. `@types/node` khai báo nó global nên `tsc` không bắt. ESM dùng `import.meta.dirname`. |
| `validationSchema: null` → `Type 'null' is not assignable to type 'StandardSchemaV1...'` | Chưa truyền schema. Khai báo `ConfigModuleOptions` cho object options để lỗi báo ở chỗ định nghĩa. |
| Port là `any`, gán vào đâu cũng được | Quên `{ infer: true }`. |
| Test xanh với mọi input | `expect(() => schema.safeParse(x)).not.toThrow()`: `safeParse` không bao giờ throw. |
| App lên ở cổng ngẫu nhiên | `API_PORT=` → `coerce` ra 0 → `listen(0)`. Thêm `.min(1)`. |

## Câu hỏi ôn tập

1. Vì sao nên để app không khởi động được khi thiếu biến env, thay vì lỗi lúc chạy?
2. `API_PORT=` trong `.env` và không có dòng `API_PORT` khác nhau thế nào với `.default(8787)`?
3. `.env` có `DATABASE_URL` mà app vẫn báo thiếu. Bạn kiểm gì đầu tiên?
4. `get("API_PORT")` và `get("API_PORT", { infer: true })` khác nhau ở đâu? Cái nào TS vẫn kiểm tên key?
5. Chạy `API_PORT=9000 make dev-api` trong khi `.env` ghi 8787 thì API nghe cổng nào? Vì sao?

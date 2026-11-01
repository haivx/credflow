# Module, controller, provider, DI trong Nest

Phase: P0 · Code: `apps/api/src/app.module.ts`, `apps/api/src/health/`, `apps/api/src/app-info/`, `apps/api/src/worker.ts`, `apps/api/src/health/health.controller.spec.ts`

## Vấn đề

Controller cần service, service cần DB, DB cần config. Tự `new` từng class thì phải tự nối cả cây phụ thuộc, mỗi chỗ tạo một bản riêng (10 connection pool), và khi test không thay được bằng bản giả.

## Cách giải và vì sao chọn

- **Decorator gắn metadata** vào class (`@Module`, `@Controller`, `@Injectable`, `@Get`). Nest đọc metadata đó lúc khởi động để dựng app. `reflect-metadata` + `emitDecoratorMetadata` giữ lại kiểu của tham số constructor lúc chạy, nên Nest biết phải inject gì. Đó là lý do `tsx`/esbuild không chạy được DI (chúng không emit metadata), dự án dùng SWC.
- **Module** khai báo 3 tầng:
  - `providers`: module này tạo và sở hữu provider (mặc định private, singleton).
  - `exports`: cho module khác dùng.
  - `imports`: được dùng những gì module kia đã export.
- Mỗi provider khai báo ở **đúng một module sở hữu**, ai cần thì import module đó. Khai báo lặp ở nhiều module thì có nhiều instance (hỏng với pool DB, cache).
- **Token:** `providers: [X]` là viết tắt của `{ provide: X, useClass: X }`. Token là chính class, không phải chuỗi `"X"`. `ctx.get(X)` / `module.get(X)` trả đúng kiểu; truyền chuỗi thì trả `any`.
- Class vừa là **giá trị** (dùng làm token) vừa là **kiểu** (mô tả instance, không phải giá trị method trả về).
- **Hai entrypoint:** `NestFactory.create(AppModule)` dựng DI + HTTP; `createApplicationContext(WorkerModule)` chỉ dựng DI. Mỗi process có module gốc riêng, phần dùng chung (`AppInfoModule`) cả hai cùng import.
- **Process Node thoát khi event loop hết việc chờ** (server đang listen, timer, connection). Worker hiện tại in log rồi thoát; từ P1 connection BullMQ giữ nó sống.
- **Test:** `Test.createTestingModule` + `{ provide: X, useValue: fake }`. Bản giả trả giá trị khác bản thật để chứng minh controller dùng bản giả. Test chạy qua SWC chỉ xoá type, không kiểm type: phải chạy cả `make test` lẫn `make typecheck`.

## Lỗi hay gặp

| Triệu chứng | Nguyên nhân |
| --- | --- |
| Route trả 404, log không có dòng `Mapped {...}` | Controller chưa khai báo trong `controllers`, hoặc module chứa nó chưa được import. Nest **không** báo lỗi. |
| `UnknownExportException ... (AppInfoModule)` | `exports` một thứ chưa có trong `providers`. Báo ở module sở hữu. |
| `Nest can't resolve dependencies of the HealthController (?) ... in the HealthModule` | Thiếu `exports` hoặc thiếu `imports`. Báo ở module **dùng**. `?` + `index [0]` chỉ tham số constructor bị thiếu. Các dòng "Potential solutions" chỉ là gợi ý. |
| `UnknownElementException: Nest could not find X element` | `get("X")` bằng chuỗi trong khi token là class. |
| `EADDRINUSE` | Process cũ còn giữ cổng. `lsof -nP -iTCP:<port> -sTCP:LISTEN` rồi `ps -o pid,ppid,command -p <pid>`. |
| Lỗi khởi động thành unhandled rejection | Promise bị bỏ lửng (`bootstrap()` không await, `app.listen` thiếu `await`). Dùng top-level `await` trong ESM. |

## Câu hỏi ôn tập

1. Nest biết inject gì vào constructor bằng cách nào? Vì sao `tsx` không chạy được DI?
2. `providers` và `exports` khác nhau thế nào? Quên mỗi cái thì lỗi gì, báo ở module nào?
3. Khai báo cùng một service trong `providers` của hai module thì sao? Khi nào điều đó gây hỏng?
4. `ctx.get("AppInfoService")` và `ctx.get(AppInfoService)` khác nhau thế nào, cả lúc chạy lẫn với TypeScript?
5. Vì sao worker hiện tại tự thoát còn API chạy mãi?
6. Test pass nhưng `tsc` báo lỗi type: vì sao xảy ra được?

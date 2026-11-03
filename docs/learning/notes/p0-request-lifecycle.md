# P0 · Vòng đời request trong Nest, pipe và exception filter

Plan 08. Code: `apps/api/src/common/`, `apps/api/src/staff/staff.controller.ts`, `apps/api/src/app.module.ts`.

## Thứ tự

```
request
  → middleware      (Express: log, cors, body parser; chưa biết handler nào sẽ chạy)
  → guard           (được vào không? auth, quyền → 401/403)
  → interceptor (trước)
  → pipe            (biến đổi + validate từng tham số: @Body, @Query, @Param)
  → handler         (method trong controller)
  → interceptor (sau)  (bọc response: đo thời gian, map kết quả)
response

Ném lỗi ở bất cứ bước nào từ guard tới interceptor → exception filter → response lỗi
```

- **Kiểm quyền ở guard**: nếu không được vào thì validate body làm gì cho tốn công.
- **Validate input ở pipe**: handler nhận dữ liệu đã đúng kiểu, không phải tự kiểm.
- **Filter là chỗ duy nhất quyết định response lỗi trông thế nào.** Pipe, handler, service chỉ việc `throw`.
- Lỗi ném trong **middleware** không đi qua filter của Nest theo cùng cách (middleware chạy ở tầng Express). CredFlow chưa viết middleware riêng.

## Pipe

- Một class implement `PipeTransform`, có `transform(value, metadata)`. Return giá trị mới (đã parse) hoặc `throw`.
- Gắn theo tham số: `@Query(new ZodValidationPipe(StaffListQuery)) q`. Mỗi endpoint truyền schema riêng.
- Vì sao Zod, không dùng `class-validator`: contract đã là Zod trong `packages/contracts`, dùng chung với web và output LLM. `class-validator` sẽ cần thêm một bộ class DTO thứ hai cùng mô tả một shape, dễ lệch nhau.

## Exception filter

- `@Catch()` không tham số = bắt mọi thứ, kể cả lỗi không phải `HttpException`.
- Nhận `(exception, host)`; lấy response bằng `host.switchToHttp().getResponse()`, rồi tự `status().json()`.
- Đăng ký global bằng provider `APP_FILTER` trong module (không dùng `app.useGlobalFilters` ở `main.ts`): integration test dựng app bằng `Test.createTestingModule`, không chạy `main.ts`, nên đăng ký ở `main.ts` thì test không có filter.

## Cùng là `ZodError`, hai nghĩa ngược nhau

| Nơi lỗi | Ai sai | Status |
| --- | --- | --- |
| Pipe parse input | Client gửi sai | 400 `VALIDATION_FAILED` (pipe ném `BadRequestException`, không để `ZodError` thô lọt ra) |
| Handler parse output (`StaffProfile.array().parse(rows)`) | Server: DB trả shape không khớp contract | 500 `INTERNAL` |

Vì vậy pipe phải tự đổi lỗi sang `HttpException`. `ZodError` thô mà tới được filter thì chắc chắn là bug phía server.

## Lỗi Postgres

| SQLSTATE | Nghĩa | API trả |
| --- | --- | --- |
| `23505` | Trùng unique | 409 `CONFLICT` |
| `23503` | FK trỏ tới dòng không có | 409 `CONFLICT` |
| `23514`, `23502` | CHECK, NOT NULL | 500 `INTERNAL` (pipe đã phải chặn; tới DB là bug) |

Mã nằm ở `error.cause.code` (Drizzle bọc lỗi của `pg`). Body lỗi 500 không chứa stack hay message gốc, chỉ ghi log.

## Khi nào không nên `throw`

`/ready` trả 503 khi Redis down. Trước plan 08 nó `throw ServiceUnavailableException`; có filter rồi thì 503 bị coi là bug (body thành `INTERNAL`, log error mỗi lần probe). 503 ở đây là **kết quả bình thường** của một health check, không phải lỗi: set status bằng `@Res({ passthrough: true }) res` → `res.status(503)` rồi `return`. `passthrough: true` để Nest vẫn tự gửi giá trị return (không có thì phải tự `res.json()`).

Quy tắc: `throw` khi request **thất bại**; trả status khác 200 nhưng không throw khi đó là **câu trả lời đúng** của endpoint.

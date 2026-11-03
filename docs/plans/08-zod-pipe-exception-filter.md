# 08 · Zod validation pipe + exception filter, format lỗi `{ code, message, details? }`

Phase: P0 · Trạng thái: Xong · Ngày: 2026-11-03

## Mục tiêu

Mọi lỗi API trả về một format duy nhất `ApiError { code, message, details? }`, mô tả bằng schema trong `packages/contracts`. Input sai bị Zod pipe chặn (400), lỗi Postgres được map ra status đúng nghĩa, bug phía server (kể cả output không khớp contract) ra 500 mà không lộ stack. Xong plan này thì đủ phần 🎓 của P0, chỉ còn kiểm `make setup && make dev` trên máy sạch.

## Quyết định đã chốt (Liam, 2026-11-03, "ok theo đề xuất")

| # | Quyết định | Lý do |
| --- | --- | --- |
| 1 | `ApiError` và `ErrorCode` đặt trong `packages/contracts` | Web sẽ parse lỗi bằng đúng schema này. Contract là nguồn sự thật cho mọi kiểu đi qua ranh giới. |
| 2 | Bộ mã tối thiểu: `VALIDATION_FAILED` 400, `NOT_FOUND` 404, `CONFLICT` 409, `INTERNAL` 500. `23505` (unique) và `23503` (FK) đều → 409 `CONFLICT` | Ít mã thì client dễ xử lý. Khi nào client cần phân biệt hai loại thì mới tách mã. |
| 3 | `23514` (CHECK), `23502` (NOT NULL) → 500 `INTERNAL`, có log | Pipe đã chặn input sai từ trước. Nếu DB vẫn từ chối thì code có bug, không phải lỗi của client. |
| 4 | Endpoint để thử: `GET /staff?role=&region=` (pipe) và `GET /staff/:id` (404 qua filter) | Một cái để học pipe, một cái để học exception đi qua filter. |

## Phạm vi

- Trong: contract `ApiError`, `ErrorCode`, `StaffListQuery`; `ZodValidationPipe`; filter global; hai endpoint staff; unit test + integration test; note học vòng đời request; đổi `console.error` sang `Logger` ở filter.
- Ngoài: RFC 9457 Problem Details ("Học nâng cao"); guard và auth (để sau MVP); interceptor (sẽ gặp ở P5 khi làm log/timing); pagination cho `/staff` (P4).

## Contract (thêm mới, cần Liam duyệt)

`packages/contracts/src/error.ts` (mới):

```ts
export const ErrorCode = z.enum(["VALIDATION_FAILED", "NOT_FOUND", "CONFLICT", "INTERNAL"]);

export const ApiError = z
  .object({
    code: ErrorCode,
    message: z.string(),
    /** VALIDATION_FAILED: danh sách issue (path, message). Mã khác: thường không có. */
    details: z.unknown().optional(),
  })
  .meta({ id: "ApiError" });
```

`packages/contracts/src/staff.ts` (thêm):

```ts
/** Query của GET /staff. strictObject: key lạ thì báo lỗi, không lặng lẽ bỏ qua. */
export const StaffListQuery = z.strictObject({
  role: z.string().min(1).optional(),
  region: z.string().min(1).optional(),
});
```

Ghi chú: `StaffProfile.role` là `z.string()`, không phải enum, nên query không kiểm "role có tồn tại không". Pipe chỉ chặn được `?role=` rỗng và key lạ (`?foo=1`). Vậy là đủ để học pipe, không đổi `StaffProfile`.

`ApiError` thêm vào `Schemas` trong `index.ts` + fixture `fixtures/ApiError.json`.

## Thay đổi

| File / module | Thay đổi | Ai làm |
| --- | --- | --- |
| `packages/contracts/src/error.ts`, `staff.ts`, `index.ts`, fixture | Như trên | Claude |
| `apps/api/src/common/zod-validation.pipe.ts` | `ZodValidationPipe(schema)` implement `PipeTransform`: `safeParse`, lỗi thì ném `BadRequestException` mang `{ code: "VALIDATION_FAILED", details: issues }` | 🎓 Liam |
| `apps/api/src/common/all-exceptions.filter.ts` | `@Catch()` bắt mọi lỗi, thứ tự xử lý: `HttpException` → giữ status, chuẩn hoá body; lỗi Postgres (Drizzle bọc lỗi `pg` trong `.cause`, đọc `.cause.code`) → bảng mã ở trên; `ZodError` → 500 (output server sai contract); còn lại → 500. Lỗi 500 thì log bằng `Logger`, body không có stack. | 🎓 Liam |
| `apps/api/src/common/pg-error.ts` | Hàm nhỏ `getPgErrorCode(err): string \| undefined`, đi theo chuỗi `.cause` | 🎓 Liam (gợi ý trước) |
| `apps/api/src/app.module.ts` | Đăng ký filter bằng provider `APP_FILTER` (để integration test qua `Test.createTestingModule` cũng có filter; `app.useGlobalFilters` trong `main.ts` thì test không có) | Claude, kèm giải thích |
| `apps/api/src/staff/staff.controller.ts` | `list(@Query(new ZodValidationPipe(StaffListQuery)) q)`; `getById(@Param("id") id)` không thấy thì ném `NotFoundException` | 🎓 Liam |
| `apps/api/src/staff/staff.service.ts` | `list(filter)` thêm `where`; `findById(id)` | Claude |
| `apps/api/src/common/*.spec.ts` | Unit test pipe và filter (giả lập `ArgumentsHost`, giả lập lỗi có `cause.code = "23505"`, `"23503"`, `"23514"`) | Claude viết khung + vài case, Liam viết case `ZodError` → 500 |
| `apps/api/test/staff.int-spec.ts` | `?role=nurse` lọc đúng; `?role=` → 400 `VALIDATION_FAILED`; `?foo=1` → 400; `/staff/<id có>` → 200; `/staff/<id không có>` → 404 `NOT_FOUND`; mọi body lỗi parse được bằng `ApiError` | Claude |
| `docs/learning/notes/p0-request-lifecycle.md` | Vòng đời request, pipe đặt ở đâu, filter bắt được gì, vì sao `ZodError` ở output là 500 | Claude |
| `docs/learning/progress.md` | Điền `code:` / `note:` dòng 13, 21, 23 (không tick) | Claude |

## Các bước học (🎓)

1. Đọc note vòng đời request, trả lời miệng: pipe chạy trước hay sau guard? Filter bắt được lỗi ném từ pipe không?
2. Viết `ZodValidationPipe` + unit test của nó.
3. Viết `getPgErrorCode` (gợi ý: lỗi gốc nằm ở `err.cause`, không phải `err`).
4. Viết filter, chạy unit test của filter cho từng nhánh.
5. Gắn pipe vào `GET /staff`, viết `GET /staff/:id`, chạy `make test-int`.

## Test và cách kiểm tra

- Unit test: pipe (hợp lệ, rỗng, key lạ); filter (`HttpException` 404, `BadRequestException` từ pipe, pg `23505`/`23503` → 409, `23514` → 500, `ZodError` → 500, `Error` thường → 500, body 500 không chứa stack).
- Integration test: như bảng trên, chạy `make test-int`.
- Eval: không cần (không đụng prompt, model, rule).
- Kiểm tra tay: `make dev-api`, `curl -i 'localhost:8787/staff?foo=1'`, `curl -i localhost:8787/staff/khong-co`.

## Tiêu chí xong

- [x] `ApiError`, `ErrorCode`, `StaffListQuery` có trong contracts, fixture parse được
- [x] Mọi response lỗi của API parse được bằng `ApiError` (có test)
- [x] Input sai → 400 `VALIDATION_FAILED` có `details`; không thấy → 404 `NOT_FOUND`
- [x] Lỗi pg `23505`/`23503` → 409; `23514`/`23502` và `ZodError` → 500 có log, không lộ stack
- [x] `make test`, `make test-int`, `make typecheck`, `make lint` pass
- [x] Note học + `progress.md` điền `code:`/`note:`; STATUS cập nhật

## Rủi ro / câu hỏi

- ~~Shape lỗi của Drizzle 0.45~~ Đã xác nhận ở plan 07 (`p0-db-constraints.md`): mã ở `error.cause.code`, tên constraint ở `error.cause.constraint`.
- `details` để `z.unknown()` cho linh hoạt. Nếu web cần hiển thị lỗi theo từng trường thì chốt shape issue (`{ path, message }[]`) ở P1, khi có form upload.

## Ghi chú khi làm

- `/ready` đổi từ `throw ServiceUnavailableException(result)` sang `@Res({ passthrough: true })` + `res.status(503)` rồi return. Lý do: filter coi mọi lỗi ≥ 500 là bug (đổi body thành `INTERNAL`, log "Unhandled exception" mỗi lần probe). 503 của `/ready` là báo cáo trạng thái, không phải lỗi. Integration test `/ready` bắt được chỗ này.
- Thêm devDependency `@types/express` (filter dùng kiểu `Response`).
- Giữ `ZodValidationPipe` tự viết; `nestjs-zod` thay được pipe nhưng không thay được filter. Xem lại ở P1 khi có nhiều endpoint nhận body / cần OpenAPI.
- Thêm integration test: route không tồn tại cũng trả `ApiError` 404.

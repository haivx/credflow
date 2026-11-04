# P0 · Ràng buộc ở DB (FK, NOT NULL, CHECK, unique, index)

Plan 07. Code: `apps/api/src/db/schema.ts`, `apps/api/drizzle/0001_complete_firelord.sql`, `apps/api/test/db-constraints.int-spec.ts`, `apps/api/test/db.ts`.

## Vì sao code validate rồi vẫn cần ràng buộc ở DB

- Code không phải đường ghi duy nhất: script seed, migration, `psql` gõ tay, service khác, bug.
- Zod kiểm từng request riêng lẻ. **Unique chỉ DB đảm bảo được**: hai upload cùng file đến cùng lúc, cả hai đều kiểm "chưa có" rồi cùng insert.
- Ba lớp, mỗi lớp chặn một kiểu lỗi: `$type<>()` (TS, lúc viết code) → Zod (lúc chạy, ở ranh giới I/O) → constraint (DB, chốt cuối).

## Các loại ràng buộc và mã lỗi

| Ràng buộc | Chặn gì | SQLSTATE |
| --- | --- | --- |
| `NOT NULL` | Thiếu giá trị | `23502` |
| FK (`REFERENCES`) | Trỏ tới dòng không tồn tại; xoá cha còn con (`RESTRICT`) | `23503` |
| `UNIQUE` (unique index) | Trùng giá trị | `23505` |
| `CHECK` | Giá trị ngoài luật (enum, `> 0`, regex `~`) | `23514` |

Test kiểm **mã lỗi + tên constraint**, không kiểm message (message đổi theo phiên bản/ngôn ngữ, mã thì chuẩn).

## Drizzle

- FK: `.references(() => staff.id, { onDelete: "restrict" })`.
- Index/check: tham số thứ ba `(t) => [uniqueIndex(...).on(t.col), check("tên", sql\`...\`)]` (dạng mảng; dạng object là cú pháp cũ).
- Danh sách `CHECK` lấy từ contracts (`DocumentStatus.options`, `ReviewAction.shape.action.options`) qua `sql.raw`, vì DDL không nhận tham số `$1`. Chỉ dùng với hằng số, không với dữ liệu người dùng.
- `jsonb` + `.$type<T>()`: chỉ có tác dụng ở TS, không sinh SQL. Trường `.optional()` trong contract → cột cho NULL, không default; trường `.default(x)` → `.notNull().default(x)`.
- `db-generate` chỉ viết file SQL; `db-migrate` mới chạy vào DB. Đọc SQL trước khi migrate.
- Lỗi Postgres bị Drizzle bọc: mã nằm ở `error.cause.code`, tên constraint ở `error.cause.constraint`.

## CASCADE hay RESTRICT

- `CASCADE`: xoá cha kéo theo xoá con. Hợp khi con vô nghĩa nếu thiếu cha (trang ảnh của một document).
- `RESTRICT`: từ chối xoá cha còn con. CredFlow dùng cho `documents → staff` và `review_actions → documents` vì đó là dữ liệu audit/eval, không được mất âm thầm.

## Index

- Không index: tìm theo cột = quét cả bảng (Seq Scan), như `array.find`. Có index (B-tree): như tra `Map`, và còn nhanh cho `>`, `<`, `ORDER BY`.
- Postgres tự tạo index cho PK và UNIQUE, **không** tự tạo cho FK → tự thêm (`review_actions_document_id_idx`).
- Cái giá: mỗi lần ghi phải cập nhật mọi index, tốn đĩa. Thêm khi cột hay dùng trong `WHERE`/`JOIN`/`ORDER BY` trên bảng lớn; đo bằng `EXPLAIN` (P3).

## Test

- `await expect(promise).rejects.toMatchObject({ cause: { code, constraint } })`. Không `await` promise trước khi đưa vào `expect`, nếu không lỗi bị ném ngay và test chết trước khi kiểm.
- `expect(fn).toThrow()` cho hàm đồng bộ; `.rejects` cho promise.
- Luôn có ca đối chứng (dữ liệu hợp lệ thì insert được), để test lỗi không "pass" vì helper sinh dữ liệu sai.
- `TRUNCATE` bảng có FK trỏ vào phải truncate cùng lúc các bảng con (`truncateAll`).

## CHECK cho qua khi biểu thức ra NULL

Bài học từ PR #16 (plan 12d, CHECK C1). `WHERE` và `CHECK` xử lý NULL **ngược nhau**:

| Biểu thức ra | `WHERE` | `CHECK` |
| --- | --- | --- |
| `true` | lấy dòng | nhận |
| `false` | bỏ dòng | **từ chối** |
| `NULL` | bỏ dòng | **nhận** |

CHECK chỉ từ chối khi biểu thức ra đúng `false`. Mà SQL có logic ba giá trị: so sánh với NULL ra NULL, và `false OR NULL` cũng ra NULL.

**Ví dụ thật.** Bản đầu của C1 trông đúng:

```sql
CHECK (status <> 'auto_approved'
  OR (routing ->> 'decision' = 'auto_approve'
      AND jsonb_array_length(routing -> 'reasons') = 0))
```

Với dòng `auto_approved`, `routing` NULL:

1. `status <> 'auto_approved'` → `false`
2. `NULL ->> 'decision' = 'auto_approve'` → `NULL`
3. `false OR NULL` → `NULL` → CHECK **nhận**

Tức là đúng dòng nguy hiểm nhất (tự duyệt mà không có quyết định routing) lại lọt. Test bắt được: `INSERT auto_approved không có routing` báo `promise resolved "Result{ command: 'INSERT', …}" instead of rejecting`.

**Cách sửa:** ép NULL thành `false`.

```sql
CHECK (status <> 'auto_approved'
  OR COALESCE(routing ->> 'decision' = 'auto_approve'
      AND jsonb_array_length(routing -> 'reasons') = 0, false))
```

**Quy tắc khi viết CHECK có cột cho phép NULL:**

- `IS NULL`, `IS NOT NULL` không bao giờ ra NULL: an toàn (A6, A7, C4, C5 đều dùng).
- `=`, `<>`, `IN`, `->>`, `jsonb_array_length` có thể ra NULL: bọc `COALESCE(…, false)`, hoặc kiểm `IS NOT NULL` trước.
- Luôn có test cho đúng ca NULL. Đọc SQL bằng mắt rất dễ bỏ sót.
- Đôi khi NULL được qua là **chủ ý**: `documents_declared_doc_type_check` dựa vào đó để cột vẫn được để trống (`schema.ts`).

Đã chạy trên Postgres thật (plan 12e): `NULL::jsonb ->> 'decision' = 'auto_approve'`, `'{}'::jsonb ->> 'decision' = 'auto_approve'` và `false OR NULL` đều ra NULL; `COALESCE(…, false)` ra `f`.

Bỏ `COALESCE` tạm trên DB test thì 3 ca lọt: `routing` NULL, `{}`, `{"decision":"auto_approve"}`. Có `COALESCE` thì cả 3 bị từ chối.

Code: `apps/api/src/db/schema.ts` (`documents_auto_approved_routing`), `apps/api/drizzle/0003_elite_shiva.sql`, `apps/api/test/db-constraints.int-spec.ts`.

# 26 · Staff đã đủ bộ giấy chưa (query có index, `EXPLAIN`)

Phase: P3 · Trạng thái: Đã duyệt · Ngày: 2026-11-06

## Mục tiêu

Config đã có `roles.<role>.required` (loại giấy mỗi vai trò phải có) nhưng chưa có code nào dùng. Làm xong thì reviewer/admin gọi `GET /staff/:id/compliance` biết staff đủ bộ chưa, thiếu loại giấy nào, theo config của mọi khách hàng của staff; query dùng index (có `EXPLAIN` chứng minh); bảng `documents` có index trên `staff_id`. Đây là tiêu chí cuối cùng của P3.

## Phạm vi

- **Trong:** contract `StaffCompliance`; hàm thuần `requiredDocTypes`; query SQL; 2 index + migration; endpoint; nạp config rule ở process API; int test có `EXPLAIN` trên ~20k dòng.
- **Ngoài:** xét hạn (sắp hết hạn / đã hết hạn): P5 cùng dashboard S4; danh sách mọi staff thiếu giấy: P5; màn hình.

## Quyết định của Liam (2026-11-06)

1. Giấy tính là "đã có" khi status `auto_approved` hoặc `approved`, loại giấy lấy từ `classification.docType`; **chưa xét hạn** ở P3.
2. Nhiều khách hàng: loại giấy yêu cầu = **hợp** `roles[role].required` của các config (`configsFor`, chặt nhất). Config không có vai trò này thì không thêm gì; không config nào có → `unknown_role`, không bao giờ "đủ".
3. Index: `documents (staff_id)`; partial `documents (staff_id, (classification->>'docType')) WHERE status IN ('auto_approved','approved')`.
4. Contract mới `StaffCompliance`.

## Thiết kế

### Contract (`packages/contracts/src/staff.ts`)

```ts
StaffCompliance = z.object({
  staffId: Id,
  role: z.string(),
  status: z.enum(["complete", "incomplete", "unknown_role"]),
  required: z.array(DocType),   // sắp theo thứ tự DocType.options
  present: z.array(DocType),    // loại giấy đã có (đã duyệt), giao với required hay không đều liệt kê
  missing: z.array(DocType),    // required − present
  configs: z.array(z.string()), // tên config đã dùng, như versions.rules
})
```

### `packages/rules` (hàm thuần)

`requiredDocTypes(configs, role): DocType[] | undefined`: hợp `required` của các config có vai trò `role`, sắp theo `DocType.options`; không config nào có vai trò → `undefined`.

### Query (`apps/api/src/staff/compliance.sql.ts`)

```sql
SELECT classification->>'docType' AS doc_type, count(*) AS n
FROM documents
WHERE staff_id = $1 AND status IN ('auto_approved', 'approved')
GROUP BY 1
```

Viết bằng `sql` template của Drizzle, export một hàm `presentDocTypesQuery(staffId)` dùng chung cho service và cho test `EXPLAIN`, để test đo đúng câu lệnh chạy thật.

### Index (`apps/api/src/db/schema.ts` → `make db-generate`)

- `documents_staff_id_idx` trên `(staff_id)`: cho `GET /documents` (plan 17) và FK.
- `documents_staff_approved_doctype_idx` trên `(staff_id, (classification->>'docType'))` `WHERE status IN ('auto_approved','approved')`: kỳ vọng `EXPLAIN` ra `Index Scan`, `Index Only Scan` hoặc `Bitmap Index Scan` trên đúng index này.

### Endpoint

`GET /staff/:id/compliance` (`@Roles("reviewer", "admin")`, như `GET /staff/:id`): staff không có → 404. `StaffModule` thêm `rulesConfigProvider` (process API giờ cũng nạp config rule; config sai → API không khởi động, như worker).

## Thay đổi

| File | Thay đổi |
| --- | --- |
| `packages/contracts/src/staff.ts`, `index.ts`, `fixtures/StaffCompliance.json` | contract mới |
| `packages/rules/src/compliance.ts` (+ test), `index.ts` | `requiredDocTypes` |
| `apps/api/src/db/schema.ts`, `apps/api/drizzle/*` | 2 index, migration |
| `apps/api/src/staff/{compliance.sql,staff.service,staff.controller,staff.module}.ts` (+ spec) | query, endpoint |
| `apps/api/test/compliance.int-spec.ts` (mới) | endpoint + `EXPLAIN` |
| `docs/flows.md`, `docs/STATUS.md`, `docs/roadmap.md` | F4 ghi phần đã có; P3 xong |
| `.claude/skills/verify/FEATURE_MAP.md` | endpoint mới |

## Vùng kiến trúc bị chạm

- `packages/contracts/src/**`
- `apps/api/src/db/schema.ts`
- `apps/api/drizzle/**`
- `.claude/skills/verify/FEATURE_MAP.md`

## Contract / config / prompt bị ảnh hưởng

- **Contract:** thêm `StaffCompliance` (không sửa schema cũ).
- **DB:** 2 index mới (không đổi cột, không đổi dữ liệu).
- Config rule, prompt, model: không đổi.

## Quyết định đáng nhớ

- **Chỗ khó nhất:** chứng minh index được dùng. Bảng nhỏ (vài chục dòng) thì Postgres luôn chọn Seq Scan dù có index, đúng hành vi; nên test `EXPLAIN` chèn ~20k document giả lập cho ~2k staff bằng `generate_series`, chạy `ANALYZE` rồi mới `EXPLAIN`.
- **Đã loại:** cột `doc_type` riêng (generated column) thay cho index trên biểu thức jsonb: rõ hơn nhưng đổi cột của bảng; index biểu thức đủ cho P3.
- **Đã loại:** tính "đủ bộ" trong code TypeScript sau khi lấy hết document của staff: đơn giản nhưng không học được GROUP BY/index, và chậm khi staff có nhiều giấy.
- **Khi nào hỏng:** P5 cần xét hạn thì phải biết ngày hết hạn đã tính; hiện chỉ có trong `extraction` (chưa tính `validityText`), nên khi đó nên lưu hạn đã tính vào document.

## Tiêu chí xong

- [ ] Unit: `requiredDocTypes` (1 config, nhiều config hợp lại, vai trò không có, thứ tự ổn định); service tính `missing`/`status`.
- [ ] Int: endpoint đủ / thiếu / `unknown_role` / staff không có → 404 / staff role → 403; giấy `needs_review`, `rejected` không tính.
- [ ] Int: `EXPLAIN` của đúng câu query trên ~20k dòng dùng `documents_staff_approved_doctype_idx`; `GET /documents` của staff dùng `documents_staff_id_idx`.
- [ ] Chạy thật: `api.sh --as reviewer@example.test GET /staff/<Maren>/compliance` sau khi upload thẻ CPR được tự duyệt → `present` có `cpr_card`, `missing` còn các loại khác.
- [ ] `make lint`, `make typecheck`, `make test`, `make test-int` xanh; `eval-ci` xanh (không đổi); CI xanh.
- [ ] Evidence report trong PR (có output `EXPLAIN`).

## Rủi ro / câu hỏi

1. Process API giờ nạp config rule: thêm một lý do để API không khởi động (đúng ý: config sai thì không chạy).
2. Chi phí: chạy thật 1 thẻ (≈ $0.0007).

## Verification plan

**Mức rủi ro:** T3: đổi contract và schema DB (migration). Liam tự chạy: để phase cuối (2026-11-06).

**Hành vi kỳ vọng:** reviewer xem một staff thấy đủ bộ hay thiếu loại giấy nào theo vai trò và khách hàng; giấy chưa duyệt không được tính.

**Các mức kiểm:**

- [ ] L0: `make lint`, `make typecheck`.
- [ ] L1: `make test`.
- [ ] L2: `make test-int` (endpoint + `EXPLAIN`); chạy thật bằng script verify.
- [ ] L2 Eval: `make eval-ci` (không đổi rule; phải giữ 0/44).

**Kịch bản:**

| # | Kịch bản | Kết quả kỳ vọng |
| --- | --- | --- |
| 1 | `requiredDocTypes([default], "caregiver")` | 4 loại theo thứ tự `DocType.options` |
| 2 | Hai config có required khác nhau cho cùng vai trò | hợp hai danh sách |
| 3 | Vai trò không có trong config nào | `undefined` → `unknown_role` |
| 4 | Staff caregiver có `cpr_card` auto_approved, `tb_test` needs_review | `present` [cpr_card], `missing` 3 loại, `incomplete` |
| 5 | Có đủ 4 loại (approved/auto_approved) | `complete`, `missing` [] |
| 6 | Không đăng nhập / staff / reviewer / admin / id không có | 401 / 403 / 200 / 200 / 404 |
| 7 | `EXPLAIN` query với 20k dòng | dùng `documents_staff_approved_doctype_idx` |
| 8 | `EXPLAIN` của câu list `GET /documents` | dùng `documents_staff_id_idx` |
| 9 | Migration chạy trên DB dev đang có dữ liệu | `make db-migrate` qua, không mất dòng |
| 10 | Chạy thật (script verify) | `present` có `cpr_card` |

**Test mới phải đỏ trước:** unit `requiredDocTypes` (chưa có module); int endpoint (404 trước khi có route); `EXPLAIN` (đỏ trước migration vì chưa có index, plan là Seq Scan).

**Thay đổi feature map:** mục mới "Compliance staff".

**Những gì sẽ KHÔNG kiểm, và lý do:** xét hạn (P5); hiệu năng thật trên dữ liệu lớn (chỉ chứng minh index được chọn).

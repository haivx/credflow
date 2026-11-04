# 12e · Cắt `params` khỏi log lỗi DB

Phase: P1 · Trạng thái: Xong · Ngày: 2026-11-04

> Làm **trước** plan 12 BullMQ (Liam chốt 2026-11-04): worker sẽ thêm nhiều đường ghi DB và ghi log.

## Mục tiêu

Log lỗi DB không còn chứa giá trị của dòng. Khi query lỗi, log vẫn đủ để debug: mã pg, constraint, bảng, câu SQL dạng `$1`, vị trí trong code.

## Quyết định đã chốt (Liam, 2026-11-04)

| # | Quyết định |
| --- | --- |
| 1 | Log SQL dạng `$1`. Thêm lint cấm `sql.raw` ở `apps/api/src`: an toàn của log và chống SQL injection đều dựa trên query có tham số. Ghi giả định vào A14 |
| 2 | Lint cấm `.stack`, miễn trừ helper. Thêm `no-console` cho `apps/api/src`. GUARDRAILS ghi rõ: gờ chính là helper + test, lint là lớp phụ |
| 3 | Thêm 2 test C1 thiếu key; cho thấy đỏ trên CHECK tạm không có `COALESCE`, rồi xanh |

**Hệ quả khi code:** `schema.ts` được miễn trừ `sql.raw` (DDL, hằng số từ contracts). 5 chỗ `console.*` ở `apps/api/src` chuyển sang `Logger` của Nest.

## Hiện trạng đã đọc

| Chỗ | Tình trạng |
| --- | --- |
| `drizzle-orm/errors.js` | `DrizzleQueryError` có message `Failed query: <sql>\nparams: <giá trị>`. `stack` bắt đầu bằng chính message đó |
| `all-exceptions.filter.ts` `logUnhandled` | log nguyên `exception.stack` → **lộ `params`** |
| Test F1 (`all-exceptions.filter.spec.ts`) | dùng `Error` giả, message không có params, chỉ phủ `detail`, nên không bắt được lỗ này |
| `pg` error `.message` | có thể chứa giá trị, vd `invalid input syntax for type integer: "..."` (chưa chạy thử, kiểm ở ca 3). Không được in message gốc |
| `health/ready.service.ts` | log `message` + `cause.message`, nhưng query là `SELECT 1`, không có giá trị dòng. Giữ nguyên |
| `scripts/seed.ts` | `console.error(err)` in cả `params`, `detail`. Chỉ có dữ liệu giả lập, chỉ chạy tay. Ngoài phạm vi |

## Thiết kế

Rule chung (đề xuất A14): **log lỗi DB chỉ gồm `PgErrorInfo` + câu SQL dạng `$1` + stack frames; không bao giờ có message gốc, `params`, `detail`, `where`.**

Hàm mới `formatErrorForLog(error): { message, stack }` trong `apps/api/src/common/pg-error.ts`:

| Loại lỗi | Nhận biết | `message` | `stack` |
| --- | --- | --- | --- |
| Lỗi DB qua Drizzle | `instanceof DrizzleQueryError` | `DB query failed pg={code,constraint,table,column} query=<sql $1>` | chỉ frames |
| Lỗi Drizzle không có SQLSTATE (mất kết nối) | như trên, `cause.code` không phải SQLSTATE | như trên, kèm `causeCode=ECONNREFUSED` | chỉ frames |
| Lỗi pg trần (không qua Drizzle) | có SQLSTATE | `DB query failed pg={...}` | chỉ frames |
| Lỗi khác | còn lại | `Unhandled exception` | giữ nguyên |

- Nhận biết bằng `instanceof`, không chỉ bằng mã pg: lỗi mất kết nối không có SQLSTATE nhưng message vẫn chứa `params`.
- Cắt theo độ dài `name: message` ở đầu `stack`, không lọc theo dòng `at`: giá trị trong `params` có thể chứa xuống dòng và giả dạng frame (ca 2).
- **"Tên query":** Drizzle không có tên query khi không dùng `.prepare(name)`. Thay bằng `error.query`: chỉ chứa `$1`, vì giá trị đi qua tham số. Ngoại lệ là `sql.raw`, và repo chỉ dùng nó với hằng số (`schema.ts`).

## Phạm vi

- **Trong:** `formatErrorForLog`, filter gọi hàm này, test với query thật, GUARDRAILS, FEATURE_MAP.
- **Ngoài:**
  - `seed.ts`, `ready.service.ts`.
  - Sửa message trả về client: body 500 vốn đã không lộ gì.
  - Log của worker và cột `documents.error`. **Plan 12 phải dùng `formatErrorForLog`, không ghi `err.message` vào cột `error`**: cột này hiện ra UI và nằm trong DB. Uncaught error của process cũng in cả thuộc tính lỗi, plan 12 cần `catch` trong job. Sẽ ghi vào STATUS "Tiếp theo".

## Thay đổi

| File | Thay đổi |
| --- | --- |
| `apps/api/src/common/pg-error.ts` (+spec) | `formatErrorForLog` |
| `apps/api/src/common/all-exceptions.filter.ts` | `logUnhandled` gọi hàm trên |
| `apps/api/test/error-log.int-spec.ts` (mới) | các ca bên dưới, query thật trên Postgres test |
| `eslint.config.mjs` + `tools/lint/guardrails.test.mjs` | (câu hỏi 1) A14: cấm `.stack` ở `apps/api/src`, trừ `pg-error.ts` và test |
| `apps/api/test/db-constraints.int-spec.ts` | (câu hỏi 2) ca C1 `routing` thiếu key |
| `docs/agent/GUARDRAILS.md`, `.claude/skills/verify/FEATURE_MAP.md`, `docs/STATUS.md` | A14; mục kỳ vọng log; plan 12 dùng helper |

## Liam tự viết

Không có: plan này không có mục 🎓 trong roadmap.

## Contract / config / prompt bị ảnh hưởng

Không có. Không đổi schema DB.

## Tiêu chí xong

- [ ] Ca 1–3 đã thấy đỏ trên filter hiện tại, xanh sau khi sửa.
- [ ] `make lint`, `make typecheck`, `make test`, `make test-int` xanh.
- [ ] GUARDRAILS có A14.
- [ ] Evidence report trong PR.

## Rủi ro / câu hỏi

1. **Thêm lint cấm `.stack` không?** Đề xuất có: rẻ, và chặn được ai đó viết lại `logger.error(err.stack)` ở worker. Giới hạn: không chặn được `console.error(err)` hay `logger.error(err.message)`, nên gờ chính vẫn là helper + test.
2. **Thêm ca C1 thiếu key vào PR này không?** PR #16 ghi `COALESCE` chặn cả `routing` NULL lẫn thiếu key, nhưng test chỉ phủ NULL. Đề xuất thêm 2 ca: `{}` và `{"decision":"auto_approve"}`, chỉ thêm test, không đổi schema.
3. **Log SQL dạng `$1` có chấp nhận được không?** Đề xuất có, vì lỗi cú pháp hay sai cột không có tên constraint, thiếu SQL thì không debug được. Nếu Liam muốn chặt hơn thì bỏ `query`, chỉ còn `PgErrorInfo` + frames.
4. Mất `message` gốc nghĩa là khi debug phải chạy lại để thấy giá trị. Đây là đánh đổi có chủ đích.

## Verification plan

**Mức rủi ro:** T2. Đổi hành vi log trên đường lỗi, liên quan `docs/data-policy.md`. Đảo ngược được, không đổi dữ liệu.

**Hành vi kỳ vọng:** query DB lỗi → client nhận 500 `INTERNAL` như cũ; log có mã, constraint, SQL `$1`, không có giá trị nào của dòng.

**Các mức kiểm:**

- [ ] L0: `make lint`, `make typecheck`.
- [ ] L1: `make test` (spec `formatErrorForLog`, spec filter cũ vẫn xanh).
- [ ] L2: `make test-int`: lỗi thật từ Postgres thật qua Drizzle thật, đưa vào filter thật. Kiểm chuỗi **thực sự ghi ra** bằng cách spy `process.stderr.write` thay vì mock `Logger` (nếu Nest không ghi qua đó khi test thì dùng `Logger` spy và ghi rõ).
- [ ] L2 Eval, L3, L4: không áp dụng.

Điều kiện: cần Docker đang chạy.

**Kịch bản** (giá trị nhạy cảm đều hư cấu, `SAMPLE-Jane-Q-Doe`):

| # | Kịch bản | Input | Kỳ vọng |
| --- | --- | --- | --- |
| 1 | CHECK nổ, có giá trị trong params | INSERT `failed` thiếu `error`, `fileName = SAMPLE-Jane-Q-Doe.png` | Điều kiện test: `err.message` chứa giá trị đó (chứng minh test không rỗng). Log **không** chứa giá trị, không có `params:`; có `23514`, `documents_failed_has_error`, `$1` |
| 2 | Giá trị giả dạng frame | `fileName = "x\n    at SAMPLE-Jane-Q-Doe"` | log không chứa giá trị |
| 3 | Lỗi pg có giá trị trong message | `` db.execute(sql`SELECT ${"SAMPLE-Jane-Q-Doe"}::int`) `` | log không chứa giá trị, có `22P02` |
| 4 | Mất kết nối | Drizzle trên pool trỏ cổng đóng, query có giá trị | log không chứa giá trị, có `causeCode` |
| 5 | Lỗi không phải DB | `new Error("boom")` | log giữ `boom` + stack (không mất khả năng debug) |
| 6 | Body client | các ca trên | 500 `INTERNAL`, không chứa SQL hay giá trị |

**Test mới phải đỏ trên code cũ:**

- Ca 1, 2, 4: chạy trên filter hiện tại → log chứa `SAMPLE-Jane-Q-Doe` → đỏ.
- Ca 3: chạy trên filter hiện tại, dán output. Nếu xanh sẵn (stack ngoài của Drizzle có thể đã chứa giá trị qua `params`, nên dự kiến đỏ) thì ghi rõ.
- Lint (nếu duyệt câu 1): tạm thêm `err.stack` vào một file `apps/api/src` → đỏ.

**Thay đổi feature map:** mục "Pipeline xử lý": log lỗi DB chỉ có `PgErrorInfo` + SQL `$1`.

**Những gì sẽ KHÔNG kiểm, và lý do:**

- 500 đi qua một endpoint HTTP thật do CHECK nổ: chưa có endpoint nào ghi cột kết quả. Plan 12 có thể kiểm.
- `seed.ts`: dữ liệu giả lập, ngoài phạm vi.
- Log hạ tầng ngoài API (Postgres server log có thể tự ghi câu lỗi): ngoài phạm vi, dev dùng dữ liệu giả lập.

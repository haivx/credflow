# 12b · Guardrail A4: test bất biến cho `route()`

Phase: P1 · Trạng thái: Xong · Ngày: 2026-11-04

## Mục tiêu

A4 ("chỉ `auto_approve` khi mọi rule `block` qua") có gờ bằng test. Bất kỳ ai sửa `route()` mà làm lệch bất biến thì `make test` đỏ. Phần eval `falseApproveRate` vẫn chờ P2.

## Phạm vi

- **Trong:**
  - `packages/rules/src/route.invariants.test.ts`: sinh **mọi** tổ hợp trong giới hạn nhỏ, không dùng thư viện property-based.
  - `GUARDRAILS.md`: A4 → 🟡.
- **Ngoài:**
  - Sửa `route()`. Ca rỗng là câu hỏi 1 bên dưới; nếu Liam muốn đổi hành vi thì làm ở bước riêng.
  - Eval `falseApproveRate` (P2).

## Lệch so với đề bài: không có severity `warn`

Contract `RuleSeverity` là `["block", "info"]` (`packages/contracts/src/rules.ts`). Bất biến 2 dùng **`info`** thay cho `warn`. Mình không đổi contract.

## Cách sinh tổ hợp

- Mỗi rule có 4 trạng thái: `severity ∈ {block, info}` × `passed ∈ {true, false}`.
- Sinh mọi danh sách dài 0–4, tính cả thứ tự: 1 + 4 + 16 + 64 + 256 = **341 danh sách**.
- Mỗi vị trí gán một `code` khác nhau, lấy từ `RuleCode.options`, để thấy rõ code nào lọt vào `reasons`.
- Một helper `allLists(maxLen)` (generator) nằm trong file test.

| # | Bất biến | Cách kiểm trên mỗi danh sách |
| --- | --- | --- |
| 1 | `auto_approve` ⇔ mọi rule `block` đều `passed` | `expect(d.decision === "auto_approve").toBe(list.filter(block).every(passed))` |
| 2 | Thêm/bớt rule `info` (qua hay không) không đổi `decision` | (a) chèn một rule `info` `passed`/không `passed` vào **mọi vị trí** → cùng `decision`; (b) bỏ hết rule `info` → cùng `decision` |
| 3 | `needs_review` → `reasons` đúng bằng code của các rule `block` không qua, theo thứ tự input, không thừa, không thiếu, không có code `info`. `auto_approve` → `reasons` rỗng | so `toEqual` với danh sách tính lại từ input |

Ca nào hỏng, message của `expect` in ra danh sách input (dạng gọn `B✓ B✗ I✗ …`), để biết ngay tổ hợp gây lỗi.

### Ca biên: danh sách rỗng

Hành vi hiện tại: `route([])` → `{ decision: "auto_approve", reasons: [] }`, vì "mọi rule block đều qua" đúng một cách rỗng (vacuous truth). Test sẽ ghi đúng hành vi này, kèm comment trỏ về câu hỏi 1.

## Thay đổi

| File | Thay đổi |
| --- | --- |
| `packages/rules/src/route.invariants.test.ts` (mới) | generator + 3 bất biến + ca rỗng |
| `docs/agent/GUARDRAILS.md` | A4 → 🟡, gờ: `route.invariants.test.ts`; eval `falseApproveRate` chờ P2 |
| `docs/STATUS.md` | mục "Đang học" |

## Contract / config / prompt bị ảnh hưởng

Không có.

## Tiêu chí xong

- [ ] 3 bất biến + ca rỗng xanh trên `route()` hiện tại; `make test`, `make lint` xanh.
- [ ] Mỗi cách sửa sai (a)(b)(c) làm ít nhất một bất biến đỏ, có output dán vào report.
- [ ] GUARDRAILS A4 🟡.
- [ ] Evidence report có trong PR.

## Rủi ro / câu hỏi

1. **`route([])` → `auto_approve` có đúng ý không?** Mình nghĩ là **không nên**. Nếu engine có bug và trả về `[]` (quên đăng ký rule cho một `docType`), document sẽ được tự duyệt mà không qua kiểm nào. Đây đúng là kiểu false approve mà metric chính cần bằng 0. "Không chắc thì chuyển cho người" gợi ý `[]` → `needs_review`. Nhưng `reasons` hiện chỉ nhận `RuleCode`, mà không có code nào cho "không có rule". Có hai cách:
   - (a) `needs_review` với `reasons: []`. Không đổi contract, nhưng người duyệt không thấy lý do.
   - (b) thêm code kiểu `NO_RULES_EVALUATED` vào `RuleCode`. Cách này đổi contract, nên cần Liam chốt.

   Plan này chỉ **ghi lại** hành vi hiện tại. Nếu Liam chọn đổi thì làm ở plan nhỏ riêng, đổi test ca rỗng trước (đỏ), rồi mới sửa `route()`.
2. **Code trùng:** hai rule `block` cùng code cùng không qua thì `reasons` hiện giữ cả hai lần. Bất biến 3 so theo thứ tự input, nên chấp nhận trùng. Generator gán code khác nhau cho từng vị trí nên không sinh ca này. Mình đề xuất để vậy; engine thật mỗi code chỉ ra một kết quả.
3. **Nhánh:** PR #13 (12a) chưa merge và cũng sửa `GUARDRAILS.md`. Mình sẽ tạo nhánh `test/12b-route-invariants` sau khi #13 merge. Nếu chưa merge, mình tạo nhánh từ `chore/12a-guardrail-lint`.

## Verification plan

**Mức rủi ro:** T1. Chỉ thêm test, không đổi hành vi. Riêng bất biến này canh đúng `falseApproveRate`, nên Liam đọc kỹ phần (a)(b)(c).

**Hành vi kỳ vọng:** sửa `route()` sai kiểu nào cũng làm `make test` đỏ, kèm tổ hợp input gây lỗi.

**Các mức kiểm:**

- [ ] L0: `make lint`, `make typecheck`.
- [ ] L1: `make test` (thêm khoảng 341 × 3 kiểm trong một vài `it`, chạy dưới 1 giây).
- [ ] L2: không áp dụng. `route()` là hàm thuần, chưa có pipeline gọi nó (BullMQ ở plan 12). Bậc kiểm thật nhất với một hàm thuần là chạy test trên đúng hàm đó. Ghi rõ trong report.
- [ ] L2 Eval: P2.

**Test mới phải đỏ trên code sai** (tạm sửa `packages/rules/src/engine.ts` → `pnpm --filter @credflow/rules test` → dán lỗi → `git checkout` → xanh):

| # | Cách sửa sai | Kỳ vọng đỏ |
| --- | --- | --- |
| a | bỏ `r.severity === "block"` trong filter | bất biến 1 (rule `info` không qua làm thành `needs_review`), 2, 3 |
| b | đảo điều kiện: `reasons.length > 0 ? auto_approve : needs_review` | bất biến 1 |
| b' | dùng `some` thay `every`: auto khi **có ít nhất một** rule `block` qua | bất biến 1 |
| c | `decision` vẫn tính từ rule `block`, nhưng `reasons` gồm mọi rule không qua (cả `info`) | **chỉ** bất biến 3. Chứng minh bất biến 3 bắt được lỗi mà 1 và 2 bỏ qua |

Sau mỗi lần: `git diff --stat packages/rules/src/engine.ts` rỗng.

**Thay đổi feature map:** không có.

**Những gì sẽ KHÔNG kiểm, và lý do:**

- Danh sách dài hơn 4: route chỉ là filter tuyến tính, độ dài 4 đã đủ phủ mọi kiểu trộn `block`/`info`/qua/không qua ở mọi vị trí.
- `evaluateRules` sinh ra kết quả đúng: chưa có code (CPR rule).
- `falseApproveRate` trên fixture thật: P2.

# 12c · `route([])` không tự duyệt + kiểm bộ rule khi khởi động

Phase: P1 · Trạng thái: Xong · Ngày: 2026-11-04

## Mục tiêu

Hai lỗ có thể dẫn tới false approve được đóng lại:

- **Engine trả về `[]`** (quên rule cho một loại giấy, bug lọc): `route()` trả `needs_review` kèm `NO_RULES_EVALUATED`, không còn `auto_approve`.
- **Bộ rule sai** (một loại giấy không có rule `block` nào, hoặc mã rule trùng): API và worker **không khởi động**, thay vì chạy với bộ rule hỏng.

## Quyết định đã chốt (Liam, 2026-11-04)

| # | Quyết định |
| --- | --- |
| 1 | Thêm `NO_RULES_EVALUATED` vào `RuleCode` (contract `rules` chưa chốt ở P1, nên được đổi) |
| 2 | Làm test-first: ca rỗng trong `route.invariants.test.ts` đổi trước (đỏ), rồi mới sửa `route()` |
| 3 | `route()` giữ nguyên, không lọc mã trùng. Mã trùng là lỗi cấu hình, chặn lúc nạp |

## ⚠️ Cần Liam chốt trước: "rule" khai báo ở đâu?

Đề bài: "kiểm khi nạp `RulesConfig`: mỗi docType có ≥1 rule block, mã rule duy nhất". Nhưng `RulesConfig` (và `config/rules/default.yaml`) hiện **không có danh sách rule**. Nó chỉ có ngưỡng (`minFieldConfidence`, `expiringSoonDays`), `roles.required`, `defaultValidityMonths` và `acceptedIssuers`. Mã rule và severity được cố định trong `docs/product.md` mục 5, tức là nằm trong **code**. Vì vậy trên config hiện tại không có gì để kiểm "≥1 rule block" hay "mã trùng".

Có hai cách:

| | (A) Registry trong code (đề xuất) | (B) Khai rule trong YAML |
| --- | --- | --- |
| Ở đâu | `packages/rules/src/registry.ts`: `RULES_BY_DOC_TYPE: Record<DocType, readonly { code: RuleCode; severity: RuleSeverity }[]>` | thêm `rules: { <docType>: [{ code, severity }] }` vào `RulesConfig` + `default.yaml` |
| Kiểm khi khởi động | `assertRulesReady(config)` trong `packages/rules`, gọi khi nạp config ở API/worker: mỗi `docType` trong `roles.*.required` có ≥1 rule `block` trong registry, mã trong mỗi `docType` là duy nhất. Sai thì `throw`, app không lên | `RulesConfig.superRefine(...)`: cùng hai kiểm đó ngay trong schema |
| Khớp `product.md` | có: severity vẫn cố định theo sản phẩm, khách hàng chỉ chỉnh ngưỡng và danh sách | **không**: khách hàng có thể hạ `EXPIRED` xuống `info`, trái với nguyên tắc "chỉ auto_approve khi mọi rule block qua". Phải sửa `product.md` trước |
| Contract đổi | chỉ `RuleCode` (+1 mã) | `RuleCode` + `RulesConfig` (thêm field, đổi YAML) |

**Đề xuất (A).** Severity là quyết định sản phẩm, không phải cấu hình của khách hàng. Registry cũng là thứ `evaluateRules` sẽ dùng khi có rule CPR, nên kiểm lúc khởi động soi đúng bộ rule sẽ chạy. Phần kiểm gắn với `RulesConfig` là: loại giấy nào được `roles` yêu cầu thì phải có rule.

Phần còn lại của plan viết theo (A).

## Phạm vi

- **Trong:**
  - `RuleCode` thêm `NO_RULES_EVALUATED`.
  - `product.md` mục 5 thêm dòng (sửa spec trước, theo CLAUDE.md).
  - `route([])` đổi hành vi.
  - Registry chỉ khai **khung** cho các `DocType`, chưa có logic rule. Logic CPR thuộc plan rule P1.
  - `assertRulesReady`, gọi lúc khởi động.
  - Test.
  - GUARDRAILS: Watchlist → Active.
- **Ngoài:** logic từng rule (`evaluateRules` vẫn throw), eval.

## Thay đổi

| File | Thay đổi |
| --- | --- |
| `docs/product.md` mục 5 | thêm `NO_RULES_EVALUATED` / block / "Engine không chấm rule nào (lỗi hệ thống, không phải lỗi giấy)" |
| `packages/contracts/src/rules.ts` | `RuleCode` thêm `NO_RULES_EVALUATED` (cuối enum) |
| `packages/rules/src/route.invariants.test.ts` | ca rỗng → `{ decision: "needs_review", reasons: ["NO_RULES_EVALUATED"] }` (**đổi trước, phải đỏ**). Bất biến 1–3 giữ như cũ, vẫn chỉ áp cho danh sách khác rỗng |
| `packages/rules/src/engine.ts` | `route()`: `results.length === 0` → `needs_review` + `["NO_RULES_EVALUATED"]` |
| `packages/rules/src/registry.ts` (mới) | `RULES_BY_DOC_TYPE`. Mỗi `DocType` khai mã + severity theo `product.md` mục 5. `unknown` chỉ có `WRONG_DOC_TYPE` (block) |
| `packages/rules/src/ready.ts` (mới) | `assertRulesReady(config, registry = RULES_BY_DOC_TYPE)`. Lỗi gom hết vào một `Error` liệt kê từng `docType` sai. Registry nhận qua tham số để test truyền registry hỏng |
| `packages/rules/src/ready.test.ts` (mới) | thiếu rule block → throw (nêu tên docType); mã trùng → throw (nêu mã); registry thật + `default.yaml` → không throw |
| API/worker: nơi nạp `RulesConfig` | gọi `assertRulesReady` ngay sau `loadRulesConfig` lúc khởi động. **Hiện API chưa nạp `RulesConfig` ở đâu** (grep `apps/api/src` không có). Nếu đúng vậy khi code, phần gọi lúc khởi động chuyển sang plan 12 BullMQ (worker là nơi chấm rule), và plan này chỉ cung cấp hàm + test |
| `docs/agent/GUARDRAILS.md` | Watchlist "mã rule trùng" → bỏ khỏi Watchlist. A4 ghi thêm `route([])` + `assertRulesReady` |

## Contract / config / prompt bị ảnh hưởng

- `RuleCode` +1 mã (Liam đã đồng ý).
- Không đổi `RulesConfig` hay YAML nếu chọn (A).
- Fixture contract: không có fixture nào chứa danh sách `RuleCode` đầy đủ (đã grep), nên không cần sửa.

## Tiêu chí xong

- [ ] Ca rỗng đã thấy đỏ trước khi sửa `route()`, xanh sau khi sửa.
- [ ] `ready.test.ts`: mỗi ca hỏng đã thấy đỏ.
- [ ] `make lint`, `make typecheck`, `make test`, `make test-int` xanh.
- [ ] Evidence report trong PR.

## Rủi ro / câu hỏi

1. **(A) hay (B)?** Xem bảng ở trên. Mình đề xuất (A).
2. Registry khai trước mã + severity cho cả 5 `DocType`, dù chưa có logic. Nếu Liam muốn chỉ khai `cpr_card` (loại duy nhất làm ở P1), thì `assertRulesReady` sẽ chặn `default.yaml`, vì `roles` đang yêu cầu `tb_test`, `background_check`… Lúc đó cần chọn: (i) khai đủ 5 loại ngay, hoặc (ii) thêm một hằng mới (vd `SUPPORTED_DOC_TYPES = ["cpr_card"]`) và P1 chỉ kiểm các loại trong đó. Mình đề xuất (i), vì bảng mã/severity đã có sẵn trong `product.md`.

## Verification plan

**Mức rủi ro:** T2. Đổi hành vi `route()` (đường quyết định duyệt) và đổi contract. Không T3, vì chưa có pipeline thật gọi `route()`.

**Hành vi kỳ vọng:**

- Engine không chấm rule nào → document vào hàng chờ duyệt với lý do `NO_RULES_EVALUATED`, không bao giờ được tự duyệt.
- Bộ rule thiếu rule `block` cho một loại giấy được yêu cầu, hoặc có mã trùng → khởi động báo lỗi nêu rõ loại giấy/mã, process thoát.

**Các mức kiểm:**

- [ ] L0: `make lint`, `make typecheck`.
- [ ] L1: `make test`. Gồm `route.invariants.test.ts` (ca rỗng mới, 3 bất biến vẫn xanh), `ready.test.ts`, và `contracts.test.ts` (enum mới).
- [ ] L2: nếu API/worker có nạp config ở plan này, tạm sửa registry cho một loại giấy mất hết rule block → `node apps/api/dist/main.js` → process thoát, dán log → hoàn tác → `/ready` 200. Nếu phần gọi lúc khởi động chuyển sang plan 12, ghi **CHƯA KIỂM L2** kèm lý do, và plan 12 nhận kịch bản này.
- [ ] L2 Eval: P2.

**Test mới phải đỏ trên code cũ:**

| Test | Cách thấy đỏ |
| --- | --- |
| ca rỗng `route.invariants` | đổi test trước, chạy trên `route()` cũ → `expected auto_approve to equal needs_review` |
| `ready.test.ts` thiếu rule block | `assertRulesReady` tạm bỏ vòng kiểm block → test đỏ |
| `ready.test.ts` mã trùng | tạm bỏ kiểm trùng → test đỏ |

**Thay đổi feature map:** mục "Pipeline xử lý" thêm kỳ vọng "`[]` rule → `needs_review` + `NO_RULES_EVALUATED`".

**Những gì sẽ KHÔNG kiểm:** `evaluateRules` có thật sự trả đủ rule theo registry hay không (chưa có logic; plan rule CPR thêm test "kết quả có đúng tập mã của registry").

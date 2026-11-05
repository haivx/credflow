# 15 · Rule engine cho thẻ CPR

Phase: P1 · Trạng thái: Đã duyệt · Ngày: 2026-11-05

## Mục tiêu

`evaluateRules` hiện còn ném "Chưa hiện thực". Làm xong thì có hàm thuần chấm đủ rule cho `cpr_card`, có test cho từng mã rule và ca biên ngày tháng. **Chưa nối vào pipeline** (plan 16), nên hành vi hệ thống đang chạy không đổi và mọi document vẫn vào `needs_review`.

## Phạm vi

- **Trong:** 9 rule của `cpr_card` theo `RULES_BY_DOC_TYPE`, xử lý ngày không dùng `Date`, tính hạn, so khớp tên và tổ chức cấp, bật 3 test thuần đang `todo`, chốt contract `rules`.
- **Ngoài:**
  - Nối vào `LlmPipeline`, trạng thái `extracted`, `auto_approved`, màn hình: plan 16.
  - Rule cho 4 loại giấy còn lại: P3, P5. `evaluateRules` trả `[]` cho các loại này, nên `route` ra `NO_RULES_EVALUATED`, không có đường tự duyệt.
  - Ngày dạng `09/02/2025`: anh đã quyết để sau.

## Cần anh duyệt riêng

Đây là các chỗ spec chưa nói rõ. Mọi lựa chọn đều nghiêng về chuyển người duyệt.

| # | Vấn đề | Đề xuất |
| --- | --- | --- |
| 1 | `RuleInput` thiếu dữ liệu cho `WRONG_DOC_TYPE`, mà rule này đã có trong registry của CPR | Thêm `classification` và `declaredDocType?` vào `RuleInput`. Sửa dòng tương ứng trong `product.md` và `CLAUDE.md` |
| 2 | Spec không kiểm độ tự tin của bước phân loại | `classification.confidence` dưới `minFieldConfidence` → `LOW_CONFIDENCE`, `fieldRefs: ["docType"]` |
| 3 | Không xác định được hạn (thiếu `completionDate`, thiếu cấu hình) | `EXPIRED` không qua. Không bao giờ coi là qua khi thiếu dữ liệu |
| 4 | `validityText` không đọc được, không có `expirationDate` | `DATE_INCONSISTENT`. Không tự rơi về `defaultValidityMonths`, vì giấy có ghi hiệu lực mà máy không hiểu |
| 5 | Ngưỡng "tương lai xa" (product mục 4) chưa có số | Hạn sau `completionDate` quá 10 năm → `DATE_INCONSISTENT`. Hằng số trong code, đổi được |
| 6 | `LOW_CONFIDENCE` chỉ nói "trường bắt buộc" trong khi hạn là tuỳ chọn | Tính cả `expirationDate`, `validityText` khi có giá trị, vì chúng quyết định `EXPIRED` |

## Thiết kế

### Chữ ký

```ts
evaluateRules({ extraction, classification, declaredDocType?, staff, config, asOf }) → RuleResult[]
```

Trả đúng tập rule trong `RULES_BY_DOC_TYPE`, severity lấy từ registry, không rule nào bị bỏ qua khi thiếu dữ liệu. Có test đối chiếu với registry.

### Từng rule

| Mã | Không qua khi |
| --- | --- |
| `WRONG_DOC_TYPE` | `classification.docType` khác `extraction.docType`, hoặc có khai loại và khác loại đã phân loại |
| `MISSING_FIELD` | `holderName`, `issuerName`, `courseType`, `completionDate` là null, rỗng hoặc toàn khoảng trắng |
| `MISSING_EVIDENCE` | **Bất kỳ trường nào** có value mà không có `evidence`, hoặc `quote` toàn khoảng trắng |
| `LOW_CONFIDENCE` | Trường bắt buộc có value, hoặc trường hạn có value, hoặc bước phân loại dưới ngưỡng |
| `DATE_INCONSISTENT` | Ngày không có thật (`2026-02-30`); `completionDate` sau `asOf`; hạn trước `completionDate`; hạn sau `completionDate` quá 10 năm; có cả `expirationDate` và `validityText` mà lệch quá 31 ngày; `validityText` không đọc được và không có `expirationDate` |
| `EXPIRED` | Hạn trước `asOf`, hoặc không xác định được hạn. Hết hạn đúng ngày `asOf` vẫn qua |
| `EXPIRING_SOON` (info) | Hạn từ `asOf` tới `asOf + expiringSoonDays`. Đã hết hạn hoặc không xác định được hạn thì qua, vì `EXPIRED` đã báo |
| `NAME_MISMATCH` | Tên sau chuẩn hoá không trùng `legalName` hay `aliases` nào |
| `ISSUER_NOT_ACCEPTED` | Tổ chức cấp sau chuẩn hoá không có trong `acceptedIssuers.cpr_card`, hoặc config không có danh sách đó |

**Thứ tự tính hạn** (`doc-types.md`): `expirationDate` → `completionDate + validityText` → `completionDate + defaultValidityMonths.cpr_card`.

### Ngày tháng (`packages/rules/src/dates.ts`)

Lint A5 cấm `Date`, nên viết hàm thuần trên chuỗi `YYYY-MM-DD`: `isRealDate`, `addMonths`, `addDays`, `daysBetween`. `addMonths` kẹp về cuối tháng: `2024-02-29` + 12 tháng = `2025-02-28`. So sánh trước sau bằng so chuỗi.

### Đọc `validityText`

Nhận `<số> year|yr|month|mo` với số dạng chữ số hoặc `one`…`five`, không phân biệt hoa thường. **Có đúng một khớp mới nhận**: "12-24 months" không đọc được. Không suy đoán.

### So khớp (`packages/rules/src/names.ts`)

- **Tên:** bỏ dấu (NFD), viết thường, bỏ `.` và `'`, gộp khoảng trắng. Có đúng một dấu phẩy thì đảo "LAST, FIRST". Bỏ token một ký tự ở giữa. So bằng nhau hoàn toàn, không fuzzy.
- **Kết quả theo dữ liệu seed:**
  - "DELACROIX JR., MARCUS" khớp "Marcus Delacroix Jr."
  - "DELACROIX, MARCUS" không khớp, chuyển người duyệt
  - "Jonathan E. Pike" không khớp "Jonathan Elsworth Pike" nếu không có alias
  - "J. Doe" không khớp "Jane Doe"
- **Tổ chức cấp:** viết thường, bỏ dấu câu, gộp khoảng trắng, so bằng nhau. "LIFELINE RESPONSE INSTITUTE" khớp; "Lifeline Response Institute, Inc." không khớp.

## Thay đổi

| File | Thay đổi |
| --- | --- |
| `packages/rules/src/engine.ts` | `RuleInput` mới, `evaluateRules` dựa trên registry |
| `packages/rules/src/cpr.ts`, `dates.ts`, `names.ts` (mới) | rule CPR, ngày, so khớp |
| `packages/rules/src/cpr.test.ts`, `dates.test.ts`, `names.test.ts` (mới) | test từng mã, ca biên |
| `packages/rules/src/recorded.test.ts` (mới), `eval/hard-cases/cpr/recorded/*.json` (mới) | chạy rule trên output thật của Haiku từ plan 14 |
| `packages/rules/src/purity.test.ts` | bật 3 `todo` |
| `packages/contracts/src/rules.ts` | chỉ đổi comment thành đã chốt |
| `docs/product.md`, `CLAUDE.md`, `docs/doc-types.md` | chữ ký mới, các quyết định ở bảng trên |
| `docs/decisions/0009-*.md` (mới) | hạn không xác định, ngưỡng 10 năm, `validityText` |
| `docs/agent/GUARDRAILS.md`, `.claude/skills/verify/FEATURE_MAP.md`, `docs/STATUS.md` | A3, A4, trạng thái rule |

## Vùng kiến trúc bị chạm

`packages/contracts/src/rules.ts` (comment), `packages/rules/src/purity.test.ts`, `CLAUDE.md`, `docs/agent/GUARDRAILS.md`, `.claude/skills/verify/FEATURE_MAP.md`.

## Contract / config / prompt bị ảnh hưởng

- **Contract:** không đổi field; `rules.ts` chuyển sang đã chốt. `RuleInput` nằm trong `packages/rules`, không phải contract.
- **Không đổi:** `config/rules/default.yaml`, schema DB, prompt, model, env.

## Quyết định đáng nhớ

- **Chỗ khó nhất:** đường code "thiếu dữ liệu" không được thành "qua". Một rule bỏ qua vì thiếu input là con đường dẫn tới duyệt nhầm, nên mỗi rule phải luôn trả kết quả và thiếu dữ liệu tính là không qua.
- **Đã loại thư viện ngày (`date-fns`):** A3 giữ package này không phụ thuộc, và cần rất ít phép tính. Test ca biên bù cho phần tự viết.
- **Đã loại fuzzy match:** product cấm; tốn thêm ca duyệt chứ không gây duyệt nhầm.
- **Khi nào hỏng:** rule tin value do LLM trả. Haiku đọc sai ngày với `confidence` cao và `quote` trùng khớp sai thì mọi rule vẫn qua. Chỉ golden set ở P2 mới đo được; đây là lý do plan 16 chưa nên coi `falseApproveRate` là đã đạt.

## Tiêu chí xong

- [ ] Mỗi mã rule có test qua và không qua, kể cả cuối tháng, năm nhuận, "LAST, FIRST".
- [ ] Bất biến: làm hỏng bất kỳ trường nào của thẻ tốt đều không ra `auto_approve`.
- [ ] 3 test thuần của `evaluateRules` được bật.
- [ ] Output thật của Haiku cho ra đúng bảng kỳ vọng.
- [ ] `make lint`, `make typecheck`, `make test`, `make test-int` xanh; `make eval` chưa có (P2).
- [ ] Evidence report có trong PR, kết quả ✅ hoặc phần chưa kiểm đã được Liam chấp nhận.

## Rủi ro / câu hỏi

1. **Fixture chưa khớp staff seed:** tên trên fixture không có trong `seed-data.ts`. Test plan này tự tạo staff giả. Plan 16 phải giải quyết để chạy end-to-end.
2. **Ngôn ngữ của `message`:** dùng tiếng Việt, khớp `docs/flows.md`. Đổi được ở màn duyệt P4.
3. **`message` có thể bị log sau này:** chỉ ghi tên trường, không chép giá trị vào `message`, theo data policy.

## Verification plan

**Mức rủi ro:** T3 (rule ảnh hưởng routing), dù chưa nối vào pipeline. **Anh cần tự chạy hoặc xem chạy ít nhất một lần:** `pnpm --filter @credflow/rules test`.

**Hành vi kỳ vọng:**

- Thẻ tốt, đúng người, còn hạn, tổ chức được chấp nhận → mọi rule `block` qua.
- Thiếu hoặc nghi ngờ bất kỳ thứ gì → có rule `block` không qua, giấy tới người duyệt.
- Hệ thống không bao giờ tự từ chối: không có code nào ra `rejected`.

**Các mức kiểm:**

- [ ] L0: `make lint` (A3, A5 phải bắt được nếu dùng `Date`), `make typecheck`.
- [ ] L1: `make test`, đây là mức chính vì rule engine là hàm thuần.
- [ ] L2: **không có check mới ở plan này**, vì chưa nối vào hệ thống đang chạy; rule kiểm chứng yêu cầu L2 cho thay đổi hành vi, và hành vi runtime không đổi. `make test-int` chạy để chứng minh không ảnh hưởng. L2 thật ở plan 16.
- [ ] L2 Eval: chưa có `make eval`. Thay bằng kịch bản 11.
- [ ] L3, L4: không áp dụng.

**Kịch bản:**

| # | Kịch bản | Kết quả |
| --- | --- | --- |
| 1 | Thẻ tốt | 9 rule qua, `route` ra `auto_approve` |
| 2 | Mỗi trường bắt buộc: null, rỗng, khoảng trắng | `MISSING_FIELD` |
| 3 | Có value không có evidence, kể cả `cardNumber` | `MISSING_EVIDENCE` |
| 4 | Confidence đúng ngưỡng, ngay dưới ngưỡng; trường hạn; bước phân loại | đúng ngưỡng qua, dưới ngưỡng `LOW_CONFIDENCE` |
| 5 | Sai loại, khai khác, không khai | `WRONG_DOC_TYPE` đúng ca |
| 6 | `2026-02-30`, ngày tương lai, hạn trước ngày học, quá 10 năm, lệch 31 và 32 ngày, `validityText` lạ | `DATE_INCONSISTENT` đúng ca, biên 31 ngày qua |
| 7 | Hạn trước, đúng, sau `asOf`; ba đường tính hạn; thiếu `completionDate`; thiếu config | `EXPIRED` đúng ca; không xác định được → không qua |
| 8 | Hạn đúng ở biên `expiringSoonDays`; sau biên; đã hết hạn | `EXPIRING_SOON` đúng ca, `route` không bị ảnh hưởng |
| 9 | Tên: dấu, "LAST, FIRST", alias, tên đệm viết tắt, hậu tố, "J. Doe", tên người khác | `NAME_MISMATCH` đúng ca |
| 10 | Tổ chức: hoa thường, khoảng trắng, "Inc.", danh sách rỗng, thiếu config | `ISSUER_NOT_ACCEPTED` đúng ca |
| 11 | Output thật của Haiku, `asOf` 2026-11-05, staff khớp tên | bảng dưới |
| 12 | Bất biến: lần lượt làm hỏng từng trường của thẻ tốt (null, bỏ evidence, confidence 0) | không bao giờ `auto_approve`; trừ `cardNumber` null vì tuỳ chọn, có kiểm riêng |
| 13 | Thuần: cùng input, input deep-freeze, đổi đồng hồ | kết quả không đổi |
| 14 | `2024-02-29` + 12 tháng, `2023-01-31` + 1 tháng, `2024-02-28` + 1 ngày, `2023-12-31` + 1 ngày | `2025-02-28`, `2023-02-28`, `2024-02-29`, `2024-01-01` |
| 15 | Loại giấy khác CPR | `[]`, `route` ra `NO_RULES_EVALUATED` |

**Kỳ vọng kịch bản 11:**

| Fixture | Rule không qua | `route` |
| --- | --- | --- |
| `01-expires` | không có | `auto_approve` |
| `02-valid-2-years` | `MISSING_FIELD`, `EXPIRED` (thiếu `completionDate`) | `needs_review` |
| `03-renewal-month` | `LOW_CONFIDENCE` (`courseType` 0.8, `expirationDate` 0.8) | `needs_review` |
| `05-injection` | `ISSUER_NOT_ACCEPTED`, tổ chức không có trong danh sách | `needs_review` |

**Test mới phải đỏ trên code cũ:**

- Mọi test của `cpr.test.ts`, `recorded.test.ts`: `evaluateRules` cũ ném lỗi nên đỏ. Sẽ cho thấy bằng cách chạy trước khi viết engine.
- Phá từng rule (luôn trả qua) → test của mã đó đỏ, và bất biến #12 đỏ nếu là rule `block`.
- Phá biên: `<` thành `<=` ở `EXPIRED`, `LOW_CONFIDENCE`, biên 31 ngày → đỏ.
- Phá `addMonths` không kẹp cuối tháng → đỏ.
- Đổi "không xác định được hạn" thành qua → đỏ.
- Dùng `new Date()` trong `dates.ts` → lint đỏ.

**Thay đổi feature map:** mục pipeline: rule engine có cho CPR, chưa nối.

**Những gì sẽ KHÔNG kiểm, và lý do:**

- Hệ thống chạy thật với rule, `falseApproveRate`: chưa nối, chưa có golden set. Plan 16, P2.
- Bộ test là do mình viết từ spec, nên không phải bằng chứng độc lập (Rule 4). Anh nên đọc kỹ bảng "Từng rule" và 6 quyết định trên.

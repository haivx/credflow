# 21 · Ngày mơ hồ trong chữ gốc không được tự duyệt

Phase: P2 · Trạng thái: Đã duyệt · Ngày: 2026-11-06

## Mục tiêu

Eval (plan 19) tìm ra 4 ca duyệt nhầm cùng một kiểu, và ca 03 hard-cases cũng vậy: ngày phải đoán (D/M đều ≤ 12 như `10/9/2025`; hạn chỉ in tháng/năm như "Valid through 12/2027") được LLM điền thành một ngày cụ thể với confidence đúng 0.85, bằng ngưỡng, nên lọt qua. Làm xong thì rule engine tự đọc `evidence.quote` của trường ngày và không cho tự duyệt khi chữ gốc mơ hồ; `falseApproveRate` dev về 0 mà không mất ca tự duyệt đúng nào; `eval/gate.json` hạ về 0.

## Phạm vi

- **Trong:** kiểm chữ gốc của `completionDate`, `expirationDate` trong `DATE_INCONSISTENT`; sửa định nghĩa trong `product.md`, `doc-types.md`; test; hạ cổng về 0; baseline mới; chạy holdout một lần để xác nhận.
- **Ngoài:**
  - Đổi ngưỡng `minFieldConfidence`, đổi prompt (hướng A, B đã loại).
  - `dateOrder: MDY` theo khách hàng: P3 (Liam 2026-11-06).
  - Loại giấy khác CPR.

## Quyết định của Liam (2026-11-06)

1. Hướng C: code kiểm `quote`, không nâng ngưỡng, không sửa prompt.
2. Dùng mã có sẵn `DATE_INCONSISTENT`, sửa định nghĩa thành "ngày mâu thuẫn, vô lý, hoặc không xác định chắc từ chữ in". Không đổi contract.
3. Ngày D/M đều ≤ 12 vẫn coi là mơ hồ ở giai đoạn này; `dateOrder: MDY` để P3.

## Cần anh duyệt riêng

| # | Vấn đề | Đề xuất |
| --- | --- | --- |
| 1 | `versions` không đổi khi chỉ sửa code rule (`versions.rules` là version của file config) | Nâng `PIPELINE_VERSIONS.pipeline` "16" → "21": kết quả cũ và mới phân biệt được khi audit. Không đổi version file config vì config không đổi |
| 2 | Kiểm cả `completionDate` hay chỉ hạn | Cả hai: ngày học mơ hồ làm hạn tính từ nó cũng mơ hồ |
| 3 | Ngày có ngày = tháng (`5/5/2026`) | Không mơ hồ: đọc kiểu nào cũng ra một ngày |
| 4 | Năm 2 chữ số (`10/9/25`) | Áp cùng luật D/M; năm 2 chữ số tự nó không tính là mơ hồ |

## Thiết kế

### `packages/rules/src/date-quote.ts` (mới, hàm thuần)

```ts
/** Lý do chữ gốc của một trường ngày không đủ để biết chắc ngày; undefined là rõ ràng. */
export function quoteDateProblem(quote: string): "ambiguous_order" | "no_day" | undefined
```

- **`ambiguous_order`:** trong quote có ngày số `a/b/yyyy` (hoặc `-`, `.`; năm 2 hoặc 4 chữ số; không dính chữ số khác ở hai đầu) mà `a ≤ 12`, `b ≤ 12`, `a ≠ b`. ISO `yyyy-mm-dd` không tính.
- **`no_day`:** quote **không** có ngày đầy đủ nào (số `a/b/y`, ISO, "March 14, 2026", "14 March 2026", tên tháng viết tắt), nhưng có tháng/năm (`12/2027`, `March 2028`, `Mar. 2028`).
- Không có ngày nào trong quote (ví dụ "Valid 2 years"): `undefined`, để các nhánh khác lo.

### Nối vào `dateProblem` (`cpr.ts`)

Sau kiểm "ngày có thật", trước các kiểm thứ tự: với `completionDate`, `expirationDate` **có value**, `quoteDateProblem(evidence.quote)`:

- `ambiguous_order` → "Ngày `<trường>` trong chữ gốc có thể đọc hai cách (tháng/ngày hoặc ngày/tháng)".
- `no_day` → "Ngày `<trường>` trong chữ gốc chỉ có tháng và năm, ngày cụ thể là suy đoán".

Message chỉ ghi tên trường, không chép giá trị (data policy, plan 15). Trường không có value hoặc không có evidence: không kiểm ở đây (`MISSING_FIELD`, `MISSING_EVIDENCE` đã lo).

### Kỳ vọng trên dữ liệu đã có

| Ca | Chữ gốc | Trước | Sau |
| --- | --- | --- | --- |
| hard 03 | "Recommended renewal: 03/2028" | `LOW_CONFIDENCE` | `LOW_CONFIDENCE` + `DATE_INCONSISTENT` |
| synth 0006 (dev) | "10/9/2025" | **auto_approve** | `DATE_INCONSISTENT` |
| synth 0021 (dev) | "Valid through 12/2027" | **auto_approve** | `DATE_INCONSISTENT` |
| synth 0001, 0014 (holdout) | "7/8/2026", "Valid through 09/2028" | **auto_approve** | `DATE_INCONSISTENT` (kiểm một lần ở cuối) |
| 01, 06, synth sạch | "March 14, 2028", "August 19, 2027", "5/28/2028", "2026-01-18" | auto_approve | không đổi |

## Thay đổi

| File | Thay đổi |
| --- | --- |
| `docs/product.md`, `docs/doc-types.md` | định nghĩa `DATE_INCONSISTENT` (sửa spec trước code) |
| `packages/rules/src/date-quote.ts` (+ `date-quote.test.ts`) | mới |
| `packages/rules/src/cpr.ts`, `cpr.test.ts` | nối kiểm quote, test mức `evaluateCpr` |
| `packages/rules/src/recorded.test.ts` | ca 03 thêm `DATE_INCONSISTENT` (hành vi đổi có chủ đích) |
| `apps/api/src/pipeline/pipeline.ts` | `pipeline: "21"` (mục duyệt 1); test int đổi theo |
| `eval/gate.json` | `maxFalseApproveCount` 2 → 0 |
| `eval/report.md`, `docs/STATUS.md` | baseline mới |
| `.claude/skills/verify/FEATURE_MAP.md` | mô tả rule |

## Vùng kiến trúc bị chạm

- `.claude/skills/verify/FEATURE_MAP.md` (mô tả rule). *Sửa khi code: bản nháp ghi "không có", sai vì `.claude/skills/verify/**` là vùng kiến trúc.*
- Rule engine `packages/rules/src/*.ts` không nằm trong vùng (trừ `route.invariants.test.ts`, `purity.test.ts`, không sửa). Đây vẫn là thay đổi T3 (rule ảnh hưởng routing).

## Contract / config / prompt bị ảnh hưởng

- Contract, config rule, prompt, model: không đổi.
- **Spec:** định nghĩa `DATE_INCONSISTENT` trong `product.md` rộng hơn (Liam đã duyệt hướng).

## Quyết định đáng nhớ

- **Chỗ khó nhất:** không phải LLM "đọc sai" mà là LLM "đoán khi không được đoán", rồi tự chấm điểm tin cậy cho lần đoán đó. Không tin điểm đó: code đọc lại chữ gốc mà LLM chép ra và tự quyết.
- **Đã loại:** nâng ngưỡng 0.86/0.9: hết duyệt nhầm nhưng tự duyệt 63.9% → 50%, và phụ thuộc thói quen chấm 0.85 của Haiku, đổi model là hỏng. Sửa prompt: prompt đã cấm đoán mà model vẫn đoán; không tất định.
- **Khi nào hỏng:** LLM chép `quote` không đúng chữ in (ví dụ tự chuẩn hoá "10/9/2025" thành "October 9, 2025") thì kiểm này không thấy mơ hồ. `MISSING_EVIDENCE` không bắt được việc chép sai; cần màn duyệt P4 và eval để theo dõi. Ghi vào rủi ro.

## Tiêu chí xong

- [ ] `make eval-ci` với `eval/gate.json` = 0: qua, 0/36 duyệt nhầm, giữ đủ 21 ca tự duyệt đúng (`autoApproveRate` 63.9% → 58.3% chỉ vì bỏ 2 ca duyệt nhầm). *Sửa khi code: bản nháp ghi "không giảm 63.9%" là sai, 63.9% gồm cả 2 ca duyệt nhầm.*
- [ ] Holdout (một lần, từ cache): 0/10 duyệt nhầm.
- [ ] Unit test cho mọi dạng chữ gốc trong bảng thiết kế; test mức `evaluateCpr` cho cả hai kiểu.
- [ ] `make lint`, `make typecheck`, `make test`, `make test-int` xanh; CI `eval-ci` xanh.
- [ ] Chạy thật một thẻ mơ hồ qua API + worker (Haiku) bằng script verify: `needs_review` kèm `DATE_INCONSISTENT`.
- [ ] Evidence report trong PR.

## Rủi ro / câu hỏi

1. **LLM chép quote đã chuẩn hoá:** kiểm này dựa vào quote chép đúng chữ in. Prompt hiện yêu cầu giữ nguyên chữ gốc trong `evidence.quote`; trên 36 ca dev chưa thấy chép sai.
2. **Chặn nhầm ca hợp lệ ở Mỹ:** `3/9/2026` đọc kiểu Mỹ là 9 tháng 3, nhưng vẫn bị chuyển người duyệt. Chấp nhận ở P2 (quyết định 3), sửa bằng `dateOrder` ở P3.

## Verification plan

**Mức rủi ro:** T3: rule ảnh hưởng routing. **Anh cần tự chạy hoặc xem chạy ít nhất một lần:** `make eval-ci` (cổng 0) và kịch bản 8.

**Hành vi kỳ vọng:**

- Thẻ ghi ngày kiểu `10/9/2025` hoặc hạn chỉ có tháng/năm luôn tới người duyệt, kèm câu giải thích, dù LLM điền ra một ngày.
- Thẻ ghi ngày rõ ràng được tự duyệt như trước.

**Các mức kiểm:**

- [ ] L0: `make lint`, `make typecheck`.
- [ ] L1: `make test`: `date-quote.test` (bảng dạng chữ), `cpr.test` (hai kiểu, trường null/không evidence, message không chứa giá trị), `recorded.test`.
- [ ] L2: `make test-int` (versions pipeline 21); `api.sh` + worker thật với một thẻ synth mơ hồ (kịch bản 8).
- [ ] L2 Eval: `make eval-ci` (dev, cổng 0) so với baseline plan 19 (2/36); holdout một lần từ cache.
- [ ] L3, L4: không áp dụng.

**Kịch bản:**

| # | Kịch bản | Kết quả kỳ vọng |
| --- | --- | --- |
| 1 | `10/9/2025`, `7/8/2026`, `10.9.2025`, `10-9-25` | `ambiguous_order` |
| 2 | `5/28/2028`, `3/14/2026`, `5/5/2026`, `2026-01-18`, `March 14, 2026`, `14 March 2026`, `Aug. 19, 2027` | `undefined` |
| 3 | `Valid through 12/2027`, `Recommended renewal: 03/2028`, `March 2028`, `Mar 2028` | `no_day` |
| 4 | `Valid 2 years from the date of completion.`, chuỗi rỗng | `undefined` |
| 5 | Quote có cả ngày đầy đủ và tháng/năm ("5/28/2028 (renew by 05/2028)") | `undefined` |
| 6 | `evaluateCpr` thẻ tốt, đổi quote hạn thành `10/9/2027` hoặc `Valid through 10/2027` | `DATE_INCONSISTENT` không qua, `route` → `needs_review`; message không chứa ngày |
| 7 | `make eval-ci` (gate 0), rồi holdout từ cache | 0/36, 21 ca tự duyệt đúng giữ nguyên (58.3%); 0/10 |
| 8 | `up.sh` → `api.sh --as staff-marisol@…` upload hard-case `03-renewal-month.png` → chờ → `GET /documents/:id` → `down.sh --clean` (staff của ca synth không có trong DB seed) | `needs_review`, reasons có `DATE_INCONSISTENT` |
| 9 | Đổi gate về 0 mà chưa có code mới | `make eval-ci` đỏ (2 > 0): bằng chứng cổng bắt được lỗi trước khi sửa |

**Test mới phải đỏ trước:** `date-quote.test` (module chưa có), test `evaluateCpr` mới (đỏ trên code cũ vì vẫn qua), kịch bản 9.

**Thay đổi feature map:** mô tả `DATE_INCONSISTENT`; baseline eval.

**Những gì sẽ KHÔNG kiểm, và lý do:**

- Quote bị LLM chuẩn hoá: chưa có ca nào như vậy trong dữ liệu; theo dõi qua eval.
- Loại giấy khác (TB có `testDate`/`readDate`): chưa có rule TB (P3).

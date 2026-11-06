# 24 · Ngày dạng "14th day of March" không bị coi là chỉ có tháng/năm

Phase: P3 · Trạng thái: Đã duyệt · Ngày: 2026-11-06

## Mục tiêu

Rule plan 21 (`quoteDateProblem`) không nhận ra ngày viết dạng thứ tự kiểu văn bản ("on this 14th day of March 2026", "valid until the 14th day of March, 2028"), coi là chỉ có tháng/năm (`no_day`) → `DATE_INCONSISTENT` → chặn thừa. Ca khó 08 (plan 22) đo được đúng lỗi này: đáp án `auto_approve`, hệ thống ra `needs_review`. Làm xong thì dạng ngày này được nhận là ngày đầy đủ; ca 08 tự duyệt; không ca nào thành duyệt nhầm.

## Phạm vi

- **Trong:** thêm dạng ngày thứ tự vào `NAMED_DATE` trong `packages/rules/src/date-quote.ts`; test; `versions.pipeline` "21" → "24"; baseline mới.
- **Ngoài:** các dạng ngày khác chưa gặp trong dữ liệu ("March the 14th, 2028" hiện ra `undefined`, tức không coi là mơ hồ, không đổi); `dateOrder` theo khách hàng (P3 sau).

## Cần anh duyệt riêng

| # | Vấn đề | Đề xuất |
| --- | --- | --- |
| 1 | Dạng nào được nhận | `<số>[st/nd/rd/th] [day] of <tháng>[.][,] <năm 4 số>`: "14th day of March 2026", "14th of March, 2028", "1st day of May 2027", "3rd day of Sept. 2027". Hậu tố thứ tự và chữ "day" đều tuỳ chọn |
| 2 | Giữ chặt | "the month of March 2028", "March 2028", "Valid through 12/2027" vẫn `no_day` (không có số ngày đứng trước "of") |
| 3 | Version | `PIPELINE_VERSIONS.pipeline` "21" → "24" (đổi code rule, như plan 21) |

## Thay đổi

| File | Thay đổi |
| --- | --- |
| `packages/rules/src/date-quote.ts`, `date-quote.test.ts` | dạng ngày thứ tự + test |
| `apps/api/src/pipeline/pipeline.ts`, `apps/api/test/worker.int-spec.ts`, `apps/api/test/pipeline-rules.int-spec.ts` | version 24 |
| `eval/report.md`, `docs/STATUS.md` | baseline |

## Vùng kiến trúc bị chạm

Không. (`packages/rules/src/date-quote.ts` không thuộc `docs/agent/architecture-zones.txt`; không sửa `route.invariants.test.ts`, `purity.test.ts`.) Vẫn là thay đổi T3: rule ảnh hưởng routing, và lần này **nới** điều kiện chặn.

## Contract / config / prompt bị ảnh hưởng

Không.

## Quyết định đáng nhớ

- **Chỗ khó nhất:** đây là thay đổi **nới** rule chặn, nên rủi ro là duyệt nhầm chứ không phải chặn thừa. Chỉ nhận dạng có số ngày đứng ngay trước "of <tháng>"; mọi dạng khác giữ như cũ.
- **Đã loại:** bỏ hẳn kiểm `no_day` cho chữ tháng (chỉ giữ dạng số `12/2027`): đơn giản hơn nhưng để lọt "Valid through March 2028".
- **Khi nào hỏng:** LLM điền ngày cho chữ dạng "the 14th day of the month following completion": có "14th day of" nhưng không có tên tháng ngay sau → regex không khớp → vẫn `no_day` (đúng).

## Tiêu chí xong

- [ ] Test: các dạng ở mục duyệt 1 ra `undefined`; mục duyệt 2 vẫn `no_day`; ca mơ hồ D/M vẫn `ambiguous_order`.
- [ ] `make eval-ci` (cổng 0): 0/40 duyệt nhầm; ca 08 `auto_approve`; chỉ ca 08 đổi decision.
- [ ] Holdout từ cache: không ca nào đổi (holdout không có dạng này).
- [ ] `make lint`, `make typecheck`, `make test`, `make test-int` xanh; CI xanh.
- [ ] Evidence report trong PR.

## Rủi ro / câu hỏi

Không gọi LLM (dùng output ghi sẵn); chi phí 0.

## Verification plan

**Mức rủi ro:** T3: nới điều kiện chặn của rule ảnh hưởng routing. **Anh cần xem chạy ít nhất một lần:** `make eval-ci`.

**Hành vi kỳ vọng:** giấy ghi ngày kiểu văn bản ("14th day of March, 2028") rõ ràng thì được tự duyệt; giấy chỉ có tháng/năm vẫn chuyển người duyệt.

**Các mức kiểm:**

- [ ] L0: `make lint`, `make typecheck`.
- [ ] L1: `make test`: `date-quote.test` thêm ca; test cũ không đổi.
- [ ] L2: `make test-int` (version 24).
- [ ] L2 Eval: `make eval-ci` 40 ca dev so với plan 22 (22/40 tự duyệt → kỳ vọng 23/40, 0 duyệt nhầm); holdout từ cache; so từng ca trước/sau.

**Kịch bản:**

| # | Kịch bản | Kết quả kỳ vọng |
| --- | --- | --- |
| 1 | "on this 14th day of March 2026.", "valid until the 14th day of March, 2028.", "the 14th of March, 2028", "1st day of May 2027", "3rd day of Sept. 2027" | `undefined` |
| 2 | "valid through the month of March 2028", "March 2028", "Valid through 12/2027", "Recommended renewal: 03/2028" | `no_day` |
| 3 | "10/9/2025 or the 14th day of March 2026" | `ambiguous_order` (thứ tự mơ hồ vẫn ưu tiên) |
| 4 | `make eval-ci` | 0/40, ca 08 `auto_approve`, chỉ 08 đổi |
| 5 | Holdout `--no-save` | không đổi so với plan 21 (0/10, 50%) |

**Test mới phải đỏ trước:** kịch bản 1 đỏ trên code hiện tại (đã chạy thử: ra `no_day`).

**Thay đổi feature map:** không.

**Những gì sẽ KHÔNG kiểm, và lý do:** chạy thật với Haiku: không đổi đường gọi LLM; output ghi sẵn của ca 08 đã có chữ gốc cần kiểm.

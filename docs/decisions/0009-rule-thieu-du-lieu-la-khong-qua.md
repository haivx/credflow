# 0009 · Rule CPR: thiếu dữ liệu tính là không qua

Trạng thái: Đã chốt · Ngày: 2026-11-05 · Plan: `docs/plans/15-rule-engine-cpr.md`

## Bối cảnh

Spec rule (`product.md` mục 5, `doc-types.md`) chưa nói rõ khi thiếu dữ liệu để chấm, và `RuleInput` không đủ dữ liệu cho `WRONG_DOC_TYPE`.

## Quyết định (Liam duyệt qua plan 15)

- `RuleInput` thêm `classification` và `declaredDocType?`.
- Mọi rule trong registry luôn được chấm. Không xác định được hạn → `EXPIRED` không qua.
- `classification.confidence` dưới `minFieldConfidence` → `LOW_CONFIDENCE`. `expirationDate`, `validityText` có giá trị cũng bị kiểm ngưỡng.
- `validityText` không đọc được, không có `expirationDate` → `DATE_INCONSISTENT`, không dùng `defaultValidityMonths`.
- Hạn sau ngày học quá 10 năm → `DATE_INCONSISTENT`.

Thêm khi code, cùng nguyên tắc: `value` null mà có `evidence` nghĩa là có chữ trên giấy nhưng không đọc được (prompt `extract-cpr@1` làm vậy với ngày dễ nhầm). Với `expirationDate`, `validityText`, ca này cũng không dùng `defaultValidityMonths`.

## Lý do

Một rule bỏ qua vì thiếu input là con đường dẫn tới duyệt nhầm. `falseApproveRate` quan trọng hơn tỉ lệ tự duyệt.

## Hệ quả

- Thẻ in hạn dạng số dễ nhầm như `09/02/2028` luôn chuyển người duyệt, tới khi có quyết định khác cho ngày dạng này ở P2.
- Thẻ không in gì về hạn vẫn được tính từ `defaultValidityMonths` và có thể tự duyệt, theo `doc-types.md`. Haiku bỏ sót hạn in trên thẻ thì rule không phát hiện được; chỉ eval ở P2 đo được.
- Rule tin value do LLM trả. Rule đúng không có nghĩa là `falseApproveRate` đạt.

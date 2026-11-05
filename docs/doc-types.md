# Loại giấy và schema trích xuất

> Bản nháp. Schema chính thức: `packages/contracts/src/extraction.ts`. Khi hai nơi lệch, contract đúng.
> Mỗi trường là `{value, confidence, evidence}`; ngày chuẩn hoá `YYYY-MM-DD`, chữ gốc nằm trong `evidence.quote`.
> Hiệu lực mặc định nằm trong `config/rules/*.yaml` và chỉ là minh hoạ.

Ký hiệu: **B** = bắt buộc để tự duyệt, T = tuỳ chọn.

## 1. `cpr_card` — Thẻ CPR / BLS / First Aid

| Trường | | Ghi chú |
| --- | --- | --- |
| `holderName` | B | Có thể ở dạng "DOE, JANE", "J. Doe" |
| `issuerName` | B | Đối chiếu `acceptedIssuers` |
| `courseType` | B | Có thể chỉ là mã ("HS-CPR-B") hoặc nằm trong đoạn văn |
| `completionDate` | B | "Class Completion Date", "Issue date", "Completed" |
| `expirationDate` | T* | "Expires", "Renewal Date", "Recommended renewal" (có khi chỉ có tháng) |
| `validityText` | T* | "Valid 2 years" khi không in ngày |
| `cardNumber` | T | Nhiều mẫu không có |

\* Cần ít nhất một trong `expirationDate` hoặc `validityText`; nếu không có cả hai thì dùng `defaultValidityMonths.cpr_card`.

**Cách tính hạn:** `expirationDate` nếu có → ngược lại `completionDate + validityText` → ngược lại `completionDate + defaultValidityMonths`. Có cả hai thì kiểm tra chéo (`DATE_INCONSISTENT` nếu lệch quá 31 ngày). Có chữ về hạn trên giấy mà không đọc được thì không dùng hiệu lực mặc định; không xác định được hạn thì `EXPIRED` không qua (ADR 0009).

**Ca khó:** ảnh chụp lệch, "Recommended renewal: 03/2028" (chỉ tháng → lấy ngày cuối tháng), thẻ "electronic only" hoặc khoá online không có phần thực hành (chính sách tuỳ khách hàng, xử lý bằng `acceptedIssuers`).

## 2. `professional_license` — Chứng chỉ / giấy phép hành nghề

| Trường | | Ghi chú |
| --- | --- | --- |
| `holderName` | B | |
| `issuerName` | B | Cơ quan/tổ chức cấp |
| `licenseType` | B | |
| `licenseNumber` | B | |
| `issueDate` | T | |
| `expirationDate` | B | Thường in sẵn |

**Ca khó:** tên sau khi đổi họ (cần `aliases`), nhiều trang, chữ ký và con dấu che chữ.

## 3. `tb_test` — Xét nghiệm lao (TB)

| Trường | | Ghi chú |
| --- | --- | --- |
| `holderName` | B | |
| `testType` | B | `skin_test` / `blood_test` / `chest_xray` |
| `testDate` | B | |
| `readDate` | T | Skin test đọc sau 48–72 giờ |
| `result` | B | `negative` / `positive` / `indeterminate` |
| `clinicName` | T | |

**Cách tính hạn:** không in hạn → `testDate + defaultValidityMonths.tb_test`.
**Rule riêng:** `result ≠ negative` → `RESULT_NOT_PASSING`. Skin test có `readDate` mà khoảng cách với `testDate` ngoài 2–3 ngày → `DATE_INCONSISTENT`.
**Ca khó:** kết quả ghi bằng số mm ("0 mm") thay vì chữ, phần viết tay.

## 4. `background_check` — Kiểm tra lý lịch

| Trường | | Ghi chú |
| --- | --- | --- |
| `subjectName` | B | |
| `providerName` | B | Công ty dịch vụ (hư cấu) |
| `completedDate` | B | |
| `result` | B | `clear` / `consider` / `not_clear` |
| `referenceNumber` | T | |

**Cách tính hạn:** `completedDate + defaultValidityMonths.background_check`.
**Rule riêng:** `result ≠ clear` → `RESULT_NOT_PASSING`.
**Ca khó:** thư văn bản tự do, kết quả nằm trong câu ("no records were found…"). Hệ thống chỉ đọc kết luận tổng; không trích xuất hay lưu chi tiết hồ sơ.

## 5. `vaccination_record` — Giấy tiêm chủng (MVP: cúm)

| Trường | | Ghi chú |
| --- | --- | --- |
| `holderName` | B | |
| `vaccine` | B | Loại vaccine của mũi được chọn |
| `doseDate` | B | Mũi **mới nhất** của đúng loại vaccine yêu cầu |
| `providerName` | T | |

**Cách tính hạn:** `doseDate + defaultValidityMonths.vaccination_record`.
**Ca khó:** bảng nhiều dòng, nhiều loại vaccine; chọn sai mũi là lỗi điển hình cần có trong golden set.

## Cố ý không làm

Bằng lái, bảo hiểm xe, giấy tờ tuỳ thân: không cần để chứng minh năng lực, và không nên làm giả giấy tờ nhà nước kể cả để test.

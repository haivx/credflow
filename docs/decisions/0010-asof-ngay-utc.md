# 0010 · `asOf` là ngày UTC lúc chấm rule, lưu kèm kết quả

Trạng thái: Đã chốt · Ngày: 2026-11-06 · Plan: `docs/plans/16-noi-rule-routing.md`

## Bối cảnh

Rule engine là hàm thuần, nhận "hôm nay" qua tham số `asOf` (`YYYY-MM-DD`). Khi nối rule vào worker (plan 16) phải chọn `asOf` lấy từ đâu và có lưu hay không. `EXPIRED`, `EXPIRING_SOON`, `DATE_INCONSISTENT` đều phụ thuộc vào ngày này.

## Quyết định (Liam duyệt qua plan 16)

- `asOf` = ngày UTC tại lúc worker chạy bước rule: `new Date().toISOString().slice(0, 10)`, qua provider `CLOCK` (`apps/api/src/common/clock.ts`). Test thay bằng ngày cố định.
- Lưu ở `DocumentRecord.asOf`, cột `documents.as_of` (`date`). CHECK C6: `auto_approved` phải có `as_of`.
- Bước rule chạy lại (job retry ở `extracted`) thì lấy lại ngày mới, ghi đúng ngày đã dùng.

## Phương án đã loại

- **Múi giờ theo khách hàng:** đúng hơn ở ngày biên, nhưng cần config múi giờ chưa có. Xem lại ở P3 khi có nhiều config khách hàng.
- **Không lưu `asOf`:** kết quả không tái lập được; không giải thích được vì sao hôm đó thẻ được tự duyệt.

## Hệ quả

- Khách ở Mỹ (sau UTC): ngày UTC bằng hoặc sau ngày địa phương, nên chỉ chặt hơn. Thẻ hết hạn đúng hôm nay giờ địa phương có thể bị báo `EXPIRED` sớm vài giờ (California từ 16h–17h). Không bao giờ cho qua thẻ đã hết hạn.
- Khách ở múi giờ trước UTC: có thể lỏng đi 1 ngày ở biên `EXPIRED`. Chưa có khách như vậy; phải xem lại trước khi có.
- Chạy lại rule với `asOf` đã lưu và cùng `versions.rules` thì ra đúng kết quả cũ.

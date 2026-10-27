# Ghi chú bố cục giấy tờ thật

> Chỉ ghi bằng lời, không lưu ảnh (xem `docs/data-policy.md`). Mục đích: thiết kế template giả lập sát thực tế.
> Mỗi loại giấy nên có 3–5 mẫu. Dùng đúng khung dưới đây để Claude Code sinh template từ đó.

## Khung ghi chú

```
### <loại giấy> · mẫu <n>
- Nguồn: <loại nguồn, ví dụ "ảnh SAMPLE do nhà cung cấp khoá học công bố">
- Dạng: thẻ / chứng nhận / biểu mẫu / thư / bảng
- Tên trường và vị trí: ...
- Định dạng ngày: ...
- Hạn: in sẵn / tự tính / chỉ có tháng / câu chữ
- Trường thiếu so với schema: ...
- Điểm đặc biệt: ...
- Ý tưởng ca khó: ...
```

## cpr_card

### cpr_card · mẫu 1
- Nguồn: ảnh "SAMPLE CARD" do một nhà cung cấp khoá BLS online công bố.
- Dạng: thẻ ngang, dải màu trên và dưới, logo tổ chức góc phải trên.
- Tên trường và vị trí:
  - tiêu đề khoá học ("Healthcare Provider BLS") ở trên;
  - tên người ở dòng to giữa thẻ (ở mẫu bị thay bằng chữ SAMPLE CARD), có gạch dưới;
  - đoạn văn mô tả khoá học ngay dưới tên, phạm vi "(Adult, Child and Infant)" nằm trong câu;
  - hai ngày nằm trên hai đường kẻ ở đáy: "Class Completion Date" (trái) và "Renewal Date" (phải), giữa là chữ "CPR/AED".
- Định dạng ngày: M/D/YYYY, không có số 0 ở đầu (4/19/2020).
- Hạn: in sẵn, nhãn là "Renewal Date" (không phải "Expires"), đúng 2 năm sau ngày học.
- Trường thiếu so với schema: không thấy số thẻ, không có mã giảng viên.
- Điểm đặc biệt: ghi "Electronic card only"; tổ chức cấp không phải các tổ chức lớn phổ biến. Đây là ví dụ cho rule `ISSUER_NOT_ACCEPTED`: thẻ đọc đúng, còn hạn, nhưng khách hàng có thể không chấp nhận.
- Ý tưởng ca khó: template cùng bố cục, đổi tổ chức hư cấu không nằm trong `acceptedIssuers`; kiểm tra chéo hạn = ngày học + 2 năm.

## professional_license

(chưa có)

## tb_test

(chưa có)

## background_check

(chưa có)

## vaccination_record

(chưa có)

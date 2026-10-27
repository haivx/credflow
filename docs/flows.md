# CredFlow — User Flows

> Bản nháp. Màn hình chi tiết thiết kế ở P1 (upload) và P4 (duyệt).

## Bản đồ màn hình

| Mã | Màn | Vai trò | Phase |
| --- | --- | --- | --- |
| S1 | Upload và danh sách giấy của tôi | Staff | P1 |
| S2 | Hàng chờ duyệt | Reviewer | P4 |
| S3 | Màn duyệt một giấy | Reviewer | P4 |
| S4 | Dashboard compliance | Admin | P5 |
| S5 | Xem cấu hình rule (chỉ đọc) | Admin | P5 |

Header có bộ chọn "đang đóng vai" (staff / reviewer / admin + người dùng giả lập). MVP không có đăng nhập.

## F0. Admin cấu hình rule

1. Admin sửa `config/rules/<client>.yaml` (MVP sửa file, không có UI sửa).
2. API khởi động → validate bằng `RulesConfig` → sai thì không khởi động, in lỗi rõ trường nào.
3. S5 hiển thị cấu hình đang áp dụng và `versions.rules`.

## F1. Nhân viên upload giấy

1. S1: chọn loại giấy (tuỳ chọn) → kéo thả PDF/ảnh (giới hạn dung lượng, chỉ PDF/PNG/JPEG).
2. API lưu file, tạo `DocumentRecord {status: uploaded}`, đẩy job, trả về ngay.
3. S1 hiện trạng thái: Đang xử lý → Đã duyệt / Đang chờ duyệt / Cần nộp lại (kèm lý do người duyệt ghi).

## F2. Xử lý tự động (job nền)

1. `processing` → tiền xử lý → phân loại → trích xuất → rule → routing.
2. Mọi lỗi kỹ thuật (LLM timeout, parse lỗi sau retry) → `needs_review` kèm ghi chú, không phải `failed`, trừ khi file hỏng không đọc được (`failed`, staff được báo nộp lại).
3. Ghi `versions`, `timingMs` cho từng bước.

## F3. Người duyệt xử lý hàng chờ (flow chính)

1. S2: danh sách `needs_review`, cột: nhân viên, loại giấy, lý do (mã rule), ngày nộp, hạn. Lọc theo lý do.
2. Mở S3:
   - Trái: ảnh giấy, phóng to được, highlight vùng của trường đang chọn (khi có `box`).
   - Phải: các trường đã trích xuất, mỗi trường có giá trị, độ tự tin, đoạn chữ gốc (`quote`); trường gây lỗi được đánh dấu.
   - Trên: rule không qua, kèm câu giải thích.
3. Sửa trường inline nếu cần → rule chạy lại ngay với giá trị đã sửa.
4. Chọn: **Duyệt** / **Từ chối** / **Yêu cầu nộp lại** (bắt buộc ghi lý do khi từ chối hoặc yêu cầu nộp lại).
5. Lưu `ReviewAction` (kèm `corrections`) → chuyển sang ca tiếp theo.

## F4. Admin theo dõi compliance

1. S4: theo nhân viên, giấy nào đủ / thiếu / sắp hết hạn / đã hết hạn so với yêu cầu theo vai trò.
2. Lọc "hết hạn trong 30 ngày". (Gửi nhắc nhở thật: ngoài phạm vi MVP.)

## Trạng thái dùng chung

Rỗng (chưa có giấy / hàng chờ trống), đang tải, lỗi mạng, file không hợp lệ, đang xử lý (job chưa xong).

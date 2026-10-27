# Chính sách dữ liệu

Repo này public. Giấy tờ credentialing chứa dữ liệu cá nhân và y tế, nên áp dụng các quy tắc sau, không có ngoại lệ.

## Được dùng

- **Giấy tờ giả lập** do `tools/synth` sinh hoặc tự làm tay, với:
  - watermark `SAMPLE` hoặc `SPECIMEN` nhìn thấy rõ;
  - tên người hư cấu;
  - tổ chức cấp, phòng khám, công ty dịch vụ hư cấu;
  - không có logo hay tên thương hiệu thật.
- **Ảnh mẫu trên mạng chỉ để tham khảo bố cục**: xem thông tin nằm ở đâu, tên trường viết thế nào, ngày định dạng ra sao. Ghi lại vào `docs/research/layout-notes.md` bằng lời, không lưu ảnh vào repo.

## Không được dùng

- Giấy tờ thật của bất kỳ ai, kể cả của chính mình, kể cả đã che thông tin.
- Ảnh tải từ mạng đưa thẳng vào golden set hoặc repo (có thể chứa thông tin người thật, và logo/mẫu thẻ thuộc bản quyền tổ chức).
- Giấy tờ tuỳ thân và giấy tờ nhà nước (bằng lái, ID, hộ chiếu), kể cả bản giả.

## Kỹ thuật

- `real-docs/`, `uploads/`, `data/`, `.env` nằm trong `.gitignore`.
- Bản demo deploy chỉ chấp nhận file giả lập; ghi rõ trên giao diện "Không upload giấy tờ thật".
- Log không ghi nội dung trường trích xuất ở mức info; chỉ ghi id, trạng thái, thời gian.
- Rule và hiệu lực trong `config/rules/` là cấu hình minh hoạ, không phải quy định pháp lý.

## Câu ghi trong writeup

> Toàn bộ dữ liệu là giả lập, được thiết kế dựa trên khảo sát bố cục giấy tờ thật; không dùng dữ liệu cá nhân thật.

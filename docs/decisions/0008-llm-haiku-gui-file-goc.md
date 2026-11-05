# 0008 · Model `claude-haiku-5-5`, gửi thẳng file gốc cho LLM

Trạng thái: Đã chốt · Ngày: 2026-11-05 · Plan: `docs/plans/14-llm-trich-xuat-cpr.md`

## Bối cảnh

Product để ngỏ model LLM tới P1. `product.md` cũng ghi bước tiền xử lý đổi PDF thành ảnh, xoay EXIF, chuẩn hoá kích thước.

## Quyết định (Liam)

- Dùng `claude-haiku-5-5` cho cả phân loại và trích xuất, `effort: low`. Hạn mức dev $5.
- Gửi thẳng file gốc: PNG/JPEG là block `image`, PDF là block `document`. Chưa có bước tiền xử lý.
- `evidence.box` bị loại bỏ trong code: Haiku vẫn trả toạ độ dù prompt yêu cầu bỏ, và chưa ai kiểm chúng đúng hay không.

## Lý do

- Giá $0.10 / $0.50 per 1M token, rẻ hơn Opus 5.5 40 lần.
- Quyết định đọc có sai cũng chưa ảnh hưởng ở P1 (chưa có đường tự duyệt), và P2 có eval để đo lại.
- API đọc được PDF, nên chưa cần thêm thư viện xử lý ảnh.

## Hệ quả

- Độ chính xác của Haiku chưa được chứng minh. `falseApproveRate` trên golden set quyết định có giữ model này không. Đổi model phải có ADR mới và `make eval`.
- Ảnh trên khoảng 7.5 MB (giới hạn API 10 MB sau base64) bị từ chối và vào `needs_review`, dù upload cho tới 10 MB.
- Màn duyệt P4 chưa có `box` để tô vùng chữ, phải kiểm độ đúng của toạ độ trước khi bật lại.
- Haiku không có fallback phía server khi từ chối: `refusal` vào `needs_review`.

# 0007 · Sweep: `processing` quá hạn chuyển người duyệt, idempotent dựa vào CAS

Trạng thái: Đã chốt · Ngày: 2026-11-05 · Plan: `docs/plans/13-sweep-idempotent.md`

## Bối cảnh

ADR 0006 để ngỏ trường hợp handler không chạy tới được bước ghi (DB chết đúng lượt cuối, job stalled hết lượt): document kẹt ở `processing`. Roadmap chỉ giao sweep cho `uploaded`, và ghi "upsert theo `(documentId, step, version)`", trong khi kết quả đang lưu thành cột trên `documents`, không có bảng theo bước.

Thử thật trên BullMQ 6.6.0: job completed/failed còn giữ làm `add` cùng `jobId` bị bỏ qua mà không báo lỗi.

## Quyết định (Liam)

- `uploaded` quá hạn, không còn job sống → xoá job đã kết thúc rồi `add` lại.
- `processing` quá hạn, không còn job sống → `needs_review`, `routing = route([])`, `error.step = "sweep"`. **Không chạy lại.**
- Bỏ upsert theo bước. Không thêm bảng. Idempotent dựa vào kiểm trạng thái đầu job và `WHERE status = from` của `DocumentStatusService.transition`, có test chạy trùng.

## Lý do

- Không chạy lại nên document làm hỏng worker không lặp vô hạn và không tốn thêm tiền LLM, không cần cột đếm số lần.
- Khớp ADR 0006 và nguyên tắc "không chắc thì chuyển cho người".
- Thêm bảng theo bước khi chưa có gì cần lịch sử từng bước là làm thừa.

## Hệ quả

- Mất dữ liệu Redis khi đang xử lý: ca `processing` sang người duyệt dù chạy lại có thể được. Chấp nhận.
- Người duyệt nhận ca chưa có trích xuất, giống ADR 0006; `error.step` phân biệt được ca do sweep.
- Lịch sweep nằm trong Redis nên phải đăng ký lại mỗi khi kết nối `ready`.
- Cần lịch sử từng bước thì mới thêm bảng và ghi ADR mới.

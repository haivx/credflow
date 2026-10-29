---
description: Cuối phiên, cập nhật STATUS và ghi ADR nếu có quyết định mới
---

1. Tóm tắt những gì đã làm trong phiên này (dựa trên git diff và các plan đã xong).
2. Cập nhật `docs/STATUS.md`: Đang làm, Tiếp theo, Vướng, Eval mới nhất (nếu đã chạy `make eval`), thêm một dòng Nhật ký. Giữ file dưới 40 dòng; dồn nhật ký cũ nếu cần.
3. Cập nhật trạng thái plan liên quan trong `docs/plans/`.
4. Cập nhật `docs/learning/progress.md`: điền `code:` / `note:` cho kiến thức đã làm trong phiên, thêm dòng "Học nâng cao" nếu có. Không tick hộ; liệt kê các mục Liam có thể tick và hỏi.
5. Nếu trong phiên có quyết định kỹ thuật mới hoặc lệch `docs/product.md`: đề xuất nội dung ADR `docs/decisions/NNNN-<slug>.md` và hỏi Liam trước khi ghi.
6. Nếu phase vừa đạt đủ tiêu chí hoàn thành trong `docs/roadmap.md`: báo rõ, kèm bằng chứng cho từng tiêu chí.

$ARGUMENTS

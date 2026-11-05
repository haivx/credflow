---
description: Mở lại phiên: đọc trạng thái đã lưu, tóm tắt đang ở đâu và làm tiếp
---

1. Đọc `docs/STATUS.md` (nhất là "Đang làm") và plan đang làm trong `docs/plans/`.
2. Chạy `git status` và `git log --oneline -5` để xem code đang dở chưa commit, đối chiếu với "Đang làm" trong STATUS. Lệch nhau thì tin git và nói rõ.
3. Tóm tắt cho Liam trong 5–8 dòng: đang ở phase nào, task nào, bước nào đã xong, câu hỏi nào còn treo.
4. Nêu **bước tiếp theo**: cần làm gì, ở file nào. Plan đã duyệt thì Claude làm tiếp; chưa có plan thì đề xuất plan.
5. STATUS trống hoặc không có gì đang dở thì chạy theo `/next`.

$ARGUMENTS

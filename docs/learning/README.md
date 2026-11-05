# Learning

> **Lưu trữ, dừng cập nhật từ 2026-11-05** (plan 12h). Quy trình dưới đây không còn áp dụng.

CredFlow vừa là sản phẩm vừa là lộ trình học lên mức middle–intermediate Node.js. Thư mục này lưu những gì đã học để ôn lại.

| File | Nội dung |
| --- | --- |
| [`progress.md`](progress.md) | Checklist kiến thức theo phase, mỗi mục có câu hỏi tự kiểm |
| [`notes/`](notes/) | Note giải thích cho chủ đề lớn, viết trong lúc làm |

## Cách học trong mỗi task

1. **Giải thích:** trước khi code một mục 🎓, Claude Code giải thích ngắn: vấn đề là gì, các cách giải, vì sao chọn cách này, lỗi hay gặp.
2. **Tự code (chế độ lai):** mỗi plan bạn tự viết một hàm/khối cốt lõi; Claude viết test trước, gợi ý khi kẹt, review. Phần còn lại Claude code rồi giải thích chỗ có kiến thức 🎓.
3. **Ghi lại:** xong một kiến thức, Claude điền đường dẫn code vào dòng tương ứng trong `progress.md`, thêm note nếu là chủ đề lớn.
4. **Tick:** bạn tự tick `[x]` khi trả lời được câu "Tự kiểm" **mà không nhìn code**. Claude không tick hộ.

## Ôn tập

- Đọc lướt các câu "Tự kiểm" chưa tick, hoặc đã tick từ lâu.
- Trả lời thành tiếng hoặc viết ra; không trả lời được thì mở note và code liên quan.
- Có thể nhờ Claude: "hỏi mình 5 câu ôn tập P1", Claude sẽ hỏi lần lượt và chỉ ra chỗ hiểu chưa đúng.

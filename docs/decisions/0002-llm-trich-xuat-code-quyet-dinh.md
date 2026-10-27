# 0002 · LLM chỉ đọc và trích xuất, code ra quyết định

Ngày: 2026-10-27 · Trạng thái: Chấp nhận · Người quyết: Liam

## Bối cảnh

Duyệt giấy tờ credentialing là quyết định có hậu quả: tự duyệt nhầm một giấy hết hạn hoặc sai người là rủi ro khi audit. LLM đọc giấy tờ không chuẩn rất tốt nhưng có thể bịa giá trị, và độ tự tin nó tự chấm không đáng tin. Quyết định cần lặp lại được, giải thích được, kiểm thử được.

## Quyết định

1. LLM chỉ làm hai việc: **phân loại** loại giấy và **trích xuất** trường có cấu trúc, mỗi trường kèm `evidence.quote`.
2. **Rule engine deterministic** (`packages/rules`, hàm thuần) kiểm tra mọi điều kiện nghiệp vụ.
3. **Routing chỉ dựa trên kết quả rule:** `auto_approve` khi và chỉ khi mọi rule `block` đều qua; còn lại `needs_review`.
4. Hệ thống **không tự từ chối**; mọi ca không qua đều do người quyết.
5. Luồng chính là **workflow cố định, không phải agent.** LLM không chọn bước tiếp theo.

## Lý do

- Tách phần xác suất (đọc) khỏi phần quyết định (rule) giúp test được rule bằng unit test và đo được phần đọc bằng eval.
- Người duyệt luôn biết vì sao một ca bị chuyển cho họ (mã rule + câu giải thích).
- Đổi model hay prompt không làm thay đổi logic nghiệp vụ.

## Hệ quả

- Không có tool hay endpoint nào cho LLM gọi để duyệt.
- Tỉ lệ tự duyệt có thể thấp hơn hệ thống "để LLM quyết"; đây là đánh đổi có chủ đích, đo bằng `autoApproveRate` song song với `falseApproveRate`.
- Nếu sau này thêm agent (ví dụ thử lại ca khó), agent chỉ được tạo ra extraction mới để rule engine kiểm tra lại, không được ra quyết định.

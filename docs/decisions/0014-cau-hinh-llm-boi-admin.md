# 0014 · Admin cấu hình LLM: khoá Anthropic riêng và model đã qua eval

Trạng thái: Đã chốt · Ngày: 2026-11-08 · Plan: `docs/plans/35-settings-llm.md` · Bổ sung ADR 0008

## Bối cảnh

Demo công khai gọi Claude bằng khoá của Liam với `claude-haiku-5-5` ("gói free", có trần ở plan 34). Liam muốn tách: dùng thử thì giữ mặc định; ai cần chính xác hơn thì tự trả bằng khoá riêng và chọn model tốt hơn. API Anthropic không có gói miễn phí lâu dài, nên "free" nghĩa là Liam trả.

## Quyết định (Liam chốt 2026-11-08)

- **Admin** đặt cấu hình LLM cho **cả hệ thống** (vẫn single-tenant; không theo từng user, không multi-tenant).
- Không có khoá riêng: khoá hệ thống (`ANTHROPIC_API_KEY`) + `DEFAULT_LLM_MODEL` (`claude-haiku-5-5`).
- Có khoá riêng: khoá được kiểm bằng `models.retrieve` (không tốn token) rồi **mã hoá AES-256-GCM** bằng khoá chủ `SETTINGS_ENCRYPTION_KEY` (env) trước khi lưu vào bảng `app_settings`. API chỉ trả 4 ký tự cuối; log chỉ ghi nguồn khoá (riêng/mặc định).
- **Danh sách model là enum `LlmModel` trong contract**, chỉ thêm model sau khi chạy `make eval` và giữ `falseApproveRate` = 0 trên dev và holdout. Hiện chỉ có `claude-haiku-5-5` (Liam 2026-11-08: chưa chạy eval Sonnet/Opus vì hạn mức khoá).
- **Không bật `fallbacks`** (chạy lại bằng model khác khi bị từ chối): model dự phòng có thể chưa qua eval. Model từ chối → giấy chuyển người duyệt như hiện nay.
- Khoá riêng không giải mã được (thiếu/sai khoá chủ) → giấy chuyển người duyệt kèm lỗi; **không** lặng lẽ quay về khoá của Liam.
- Trần của plan 34 (rate limit, 50 giấy/ngày) áp cho mọi chế độ.
- `versions.model` ghi model thật đã dùng cho từng giấy.

## Phương án đã loại

- **Khoá theo từng user / từng công ty:** đúng mô hình SaaS nhưng cần multi-tenant (để sau MVP).
- **Cho nhập tên model tuỳ ý:** model chưa eval có thể làm tăng duyệt nhầm.
- **Lưu khoá dạng rõ trong DB:** DB lộ (backup, ảnh chụp) là lộ khoá có thể tiêu tiền.
- **Secret manager / KMS:** chắc hơn nhưng vượt mức middle (Học nâng cao).

## Hệ quả

- Đổi hoặc mất `SETTINGS_ENCRYPTION_KEY` → khoá đã lưu vô dụng, admin phải dán lại. Chưa có xoay khoá chủ.
- Mỗi giấy worker đọc `app_settings` một lần (một query nhỏ); đổi cấu hình có hiệu lực từ giấy kế tiếp.
- Thêm model mới: sửa enum `LlmModel` + chạy eval + cập nhật ADR này.

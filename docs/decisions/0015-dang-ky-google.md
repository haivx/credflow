# 0015 · Staff tự đăng ký bằng Google

Trạng thái: Đã chốt · Ngày: 2026-11-08 · Plan: `docs/plans/36-dang-ky-google.md` · Bổ sung ADR 0004

## Bối cảnh

Demo công khai trên Railway chỉ có tài khoản seed dùng chung. Người thử phải xin mật khẩu và thấy giấy của nhau. Liam muốn người thử tự có tài khoản riêng bằng Gmail.

## Quyết định (Liam chốt 2026-11-08)

- Mọi tài khoản Google có `email_verified = true` đều tự đăng ký được, nhận vai trò **staff**; hệ thống tạo kèm hồ sơ staff (`legalName` = tên Google, vai trò `caregiver`, không thuộc khách hàng nào nên dùng config `default`).
- Đăng nhập email + mật khẩu giữ song song. Reviewer và admin không bao giờ vào bằng Google (CHECK trong DB).
- Luồng OAuth authorization code + PKCE chạy hết ở server bằng `google-auth-library`; `state` và `code_verifier` nằm trong cookie `httpOnly` ký HMAC, sống 10 phút. Kiểm chữ ký và audience của `id_token`.
- User nhận diện bằng `sub` của Google (cột `users.google_sub`), không bằng email.
- **Không tự liên kết theo email:** email đã có tài khoản mật khẩu → báo lỗi, không gắn.
- Tối đa `SIGNUP_DAILY_CAP` (mặc định 20) tài khoản mới mỗi ngày UTC, đếm trong DB.
- Thiếu biến môi trường Google → tính năng tắt, nút ẩn.

## Phương án đã loại

- **Passport (`passport-google-oauth20`):** thêm strategy và serialize trong khi app đã có session riêng; khó đọc hơn ở mức middle.
- **Tự liên kết theo email:** người có Gmail trùng email sẽ vào được tài khoản người khác.
- **Chỉ email đã có sẵn / admin duyệt:** Liam chọn mở cho mọi Gmail để demo dễ thử; trần mỗi ngày chặn chi phí.
- **Lưu token Google:** app chỉ cần biết danh tính, không gọi API Google thay user.

## Hệ quả

- `users.password_hash` cho phép null; đăng nhập mật khẩu với tài khoản Google trả cùng lỗi 401 như sai mật khẩu.
- Tên Google thường khác tên in trên thẻ giả lập → `NAME_MISMATCH`, giấy vào hàng chờ. Đúng nguyên tắc "không chắc thì chuyển người".
- App Google ở chế độ Testing chỉ cho email trong danh sách test; muốn mở cho mọi Gmail phải publish app trên Google Cloud Console.

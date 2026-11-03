# 0004 · Đăng nhập cơ bản: email + mật khẩu, session trong Postgres

Ngày: 2026-11-03 · Trạng thái: Chấp nhận · Người quyết: Liam

## Bối cảnh

Bản đầu của `docs/product.md` để đăng nhập ra ngoài MVP: header có bộ chọn "đang đóng vai", API tin `staffId` client gửi lên. Ngày 2026-11-03, trước khi làm upload (P1), Liam quyết định làm đăng nhập cơ bản luôn. Lý do: upload cần biết *ai* đang nộp giấy, mà lấy `staffId` từ form thì ai cũng nộp hộ người khác được; hàng chờ duyệt (P4) và `review_actions.reviewerId` cũng cần một user thật để gắn vào.

## Quyết định

1. **Email + mật khẩu.** User là dữ liệu giả lập do seed tạo. Không có đăng ký, quên mật khẩu, SSO/OIDC.
2. **Hash mật khẩu bằng `crypto.scrypt`** có sẵn trong Node (salt ngẫu nhiên 16 byte cho mỗi user, so sánh bằng `timingSafeEqual`). Không thêm thư viện.
3. **Session lưu ở Postgres.** Đăng nhập xong server sinh token ngẫu nhiên 32 byte, trả cho trình duyệt bằng cookie, còn DB chỉ lưu sha256 của token. Session hết hạn sau 7 ngày, đăng xuất thì xoá dòng.
4. **Cookie** `httpOnly`, `SameSite=Lax`, `Path=/`; `Secure` bật bằng env (tắt khi dev trên http).
5. **Mỗi user có đúng một vai trò** trong `staff | reviewer | admin`. User vai trò `staff` phải gắn với một dòng `staff` (`CHECK` ở DB).
6. **Kiểm quyền bằng guard toàn cục** (`APP_GUARD`): `AuthGuard` mặc định chặn mọi route, route mở thì gắn `@Public()`; sau đó `RolesGuard` đọc `@Roles(...)`. Không dùng Passport.
7. Chưa đăng nhập hoặc session hết hạn → 401 `UNAUTHORIZED`. Đã đăng nhập nhưng sai vai trò → 403 `FORBIDDEN`.

## Lý do

- **Session thay vì JWT:** thu hồi ngay được (đăng xuất, khoá user chỉ cần xoá dòng). Đổi lại mỗi request tốn thêm một query theo khoá unique, không đáng kể ở quy mô này. Web và API chạy cùng site, không có client mobile, nên ưu điểm "không cần state" của JWT ở đây không dùng tới.
- **Token chỉ lưu dạng hash:** DB lộ ra thì token cũng không dùng được. Token ngẫu nhiên 256 bit nên sha256 là đủ. Mật khẩu thì khác: mật khẩu do người đặt nên dễ đoán, phải dùng hàm hash chậm có salt (scrypt).
- **scrypt có sẵn trong Node:** không có dependency native (bcrypt, argon2 cần build), và đủ an toàn cho demo.
- **Không dùng Passport:** guard tự viết chỉ vài chục dòng và thấy rõ vòng đời request. Passport chủ yếu có ích khi cần nhiều chiến lược (OAuth, SAML), lúc đó xem lại.
- **Guard toàn cục mặc định chặn:** quên gắn decorator thì route bị khoá chứ không bị mở, vì "quên" là lỗi hay gặp nhất.

## Phương án đã cân nhắc

- **Giữ bộ chọn vai trò giả lập (spec cũ).** Đơn giản nhất, nhưng phải tin `staffId` client gửi lên; dedupe theo checksum (plan 11) cũng không kiểm được "file này của ai". Không chọn.
- **JWT trong cookie.** Không cần bảng `sessions`, nhưng đăng xuất không có hiệu lực ngay, phải thêm refresh token hoặc blacklist. Không chọn.
- **Lưu session ở Redis.** Nhanh hơn, nhưng Redis của dự án là hàng đợi (`noeviction`, chấp nhận mất dữ liệu, ADR 0001), không phải nơi lưu trạng thái lâu dài. Không chọn.
- **OIDC (Auth0, Keycloak).** Đúng cho sản phẩm thật, nhưng phải dựng thêm service và che mất phần cần học. Để sau MVP.

## Hệ quả

- Contract thêm `UserRole`, `LoginRequest`, `AuthUser`; `ErrorCode` thêm `UNAUTHORIZED`, `FORBIDDEN`.
- DB thêm bảng `users`, `sessions`. Endpoint hiện có (`/staff`) phải đăng nhập; integration test cần helper đăng nhập.
- Web (plan sau) phải gọi API **cùng site** với trang để cookie được gửi kèm: `localhost` và `127.0.0.1` là hai site khác nhau. Hướng xử lý: Next `rewrites` proxy `/api/*` sang API.
- Chưa có CSRF token: dựa vào `SameSite=Lax` và việc API chỉ nhận JSON (form HTML không gửi được `application/json`). Upload multipart (plan 11) cũng là request ghi, nhưng chỉ gửi được từ cùng site vì `SameSite=Lax` không gửi cookie trong POST cross-site.
- Chưa chặn brute-force login, chưa xoá session hết hạn định kỳ. Ghi ở "Học nâng cao" trong roadmap.

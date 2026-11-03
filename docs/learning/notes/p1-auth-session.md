# P1 · Đăng nhập cơ bản: mật khẩu, session, cookie, guard

Plan 10, ADR 0004. Code: `apps/api/src/auth/`, `apps/api/src/app.module.ts`, `apps/api/test/auth.int-spec.ts`.

## Luồng

```
POST /auth/login {email, password}
  → ZodValidationPipe (LoginRequest)
  → AuthService.login: tìm user theo email (chữ thường) → verifyPassword (scrypt)
  → sinh token ngẫu nhiên 32 byte → INSERT sessions(token_hash = sha256(token), expires_at)
  → Set-Cookie: credflow_session=<token>; HttpOnly; SameSite=Lax; Path=/

Request sau đó
  → cookie-parser (middleware) đọc header Cookie vào req.cookies
  → AuthGuard: route @Public? qua. Không thì sha256(token) → JOIN sessions + users, expires_at > now()
               không có → 401; có → req.user = AuthUser
  → RolesGuard: route có @Roles(...) mà user.role không nằm trong đó → 403
  → pipe → handler (@CurrentUser() lấy req.user)

POST /auth/logout → DELETE session → clearCookie. Cookie cũ dùng lại → 401 ngay.
```

## 1. Mật khẩu: hash chậm có salt. Token: sha256 là đủ

- **Không lưu mật khẩu thô**, cũng không lưu mã hoá được (mã hoá thì giải mã được). Chỉ lưu hash: login thì hash mật khẩu nhập vào rồi so sánh.
- **Vì sao không dùng sha256 cho mật khẩu:** sha256 rất nhanh, GPU thử được hàng tỉ mật khẩu mỗi giây. Mật khẩu do người đặt nên dễ đoán (`123456`, tên + năm sinh). DB lộ ra thì đoán ngược nhanh. `scrypt` chậm có chủ đích (mỗi lần tốn ~16 MB RAM và vài chục ms), nên đoán hàng loạt đắt hơn rất nhiều lần.
- **Salt:** chuỗi ngẫu nhiên riêng cho mỗi user, trộn vào trước khi hash. Không có salt thì hai user cùng mật khẩu ra cùng hash, và kẻ tấn công dùng được bảng hash tính sẵn (rainbow table). Có salt thì phải đoán riêng từng user.
- **Tham số nằm trong chuỗi lưu** (`scrypt$16384$8$1$<salt>$<hash>`): sau này tăng N cho mạnh hơn thì hash cũ vẫn verify được với tham số cũ.
- **`timingSafeEqual`:** `===` dừng ở byte khác đầu tiên, nên thời gian so sánh lộ ra "đúng được bao nhiêu byte". So sánh thời gian cố định thì không lộ.
- **Session token khác mật khẩu:** token là 256 bit ngẫu nhiên do máy sinh, không thể đoán. Nên sha256 (nhanh) là đủ, không cần salt. Chỉ lưu hash để DB lộ ra thì token cũng không dùng được.
- **Email không tồn tại vẫn chạy scrypt** với một hash giả: nếu không, "sai email" trả lời nhanh hơn "sai mật khẩu" và kẻ tấn công dò được email nào có tài khoản. Hai trường hợp cũng trả cùng một câu lỗi.

## 2. Session so với JWT

| | Session trong DB (CredFlow) | JWT |
| --- | --- | --- |
| Cookie chứa | Token ngẫu nhiên, không mang thông tin gì | Dữ liệu (userId, role) + chữ ký |
| Mỗi request | 1 query theo unique index | Chỉ verify chữ ký, không query |
| Đăng xuất / khoá user | Xoá dòng, có hiệu lực ngay | Token còn hạn vẫn dùng được, phải thêm blacklist hoặc refresh token ngắn hạn |
| Đổi role | Có hiệu lực ngay (role đọc từ DB mỗi request) | Phải chờ token hết hạn |

JWT hợp khi nhiều service cần tự kiểm token mà không gọi DB chung. CredFlow có một API, một Postgres, nên session đơn giản và an toàn hơn.

## 3. Cờ cookie

- **`HttpOnly`:** JavaScript trên trang không đọc được (`document.cookie` không thấy). Trang bị XSS thì kẻ tấn công không lấy trộm được token. Không chống được việc script đó gửi request *từ chính trang* (trình duyệt vẫn đính cookie).
- **`SameSite=Lax`:** trình duyệt không gửi cookie khi site khác gửi POST/fetch tới API (chặn phần lớn CSRF); bấm link điều hướng GET từ site khác thì vẫn gửi. `Strict` chặn cả link, `None` không chặn gì (phải kèm `Secure`).
- **`Secure`:** chỉ gửi qua HTTPS. Dev chạy http nên tắt bằng `COOKIE_SECURE=false`; deploy bật lên.
- **`Path=/`, `Expires`:** cookie gửi cho mọi đường dẫn, hết hạn cùng session trong DB. `clearCookie` phải dùng cùng `path`/`sameSite`/`secure` như lúc set, không thì trình duyệt coi là cookie khác và không xoá.
- **Site khác origin:** `localhost:3000` và `localhost:8787` cùng *site* (khác port vẫn cùng site), còn `localhost` và `127.0.0.1` là hai site khác nhau. Web sẽ proxy `/api/*` sang API để mọi request cùng origin.

## 4. Guard, metadata, `Reflector`

- Guard chạy **sau middleware, trước pipe** (xem `p0-request-lifecycle.md`). Vì vậy `cookie-parser` (middleware) phải chạy trước để guard có `req.cookies`.
- `@Public()` và `@Roles(...)` chỉ là `SetMetadata(key, value)`: gắn dữ liệu lên method hoặc class, không tự chặn gì cả. Guard đọc lại bằng `reflector.getAllAndOverride(key, [handler, class])`: tìm ở method trước, không có thì tìm ở class. Nhờ vậy `@Roles` gắn trên controller áp cho mọi method, method nào cần khác thì gắn đè.
- **Mặc định chặn:** `AuthGuard` đăng ký toàn cục bằng `APP_GUARD`. Thêm route mới mà quên decorator thì route bị khoá (401), không bị mở. Quên là lỗi hay gặp nhất, nên để lỗi đó xảy ra theo hướng an toàn.
- **Thứ tự hai guard toàn cục** là thứ tự đăng ký trong `providers` của `AuthModule`. `RolesGuard` cần `req.user` do `AuthGuard` gắn, nên phải đăng ký sau.
- `@CurrentUser()` (`createParamDecorator`) lấy `req.user` cho handler, không phải tự đọc `@Req()`.
- Route không tồn tại (404) không chạy guard: Nest không tìm thấy handler nên không có gì để bảo vệ.

## 5. 401 khác 403

- **401 Unauthorized** = "không biết anh là ai": chưa đăng nhập, cookie bịa, session hết hạn. Client nên đưa về màn login.
- **403 Forbidden** = "biết anh là ai, nhưng anh không được làm việc này": staff gọi `/staff`. Đăng nhập lại cũng không giúp gì.

## Lỗi hay gặp

- `z.coerce.boolean()` cho env: chuỗi `"false"` thành `true` (mọi chuỗi khác rỗng đều truthy). Dùng `z.stringbool()`.
- Supertest: `request(server).get(...).set("Cookie", await f())` mà `f` cũng gọi supertest trên cùng server → lỗi `Cannot read properties of null (reading 'address')`. Lấy cookie ra biến trước rồi mới tạo request.
- Trả cả `row` từ DB ra response → lộ `passwordHash`. Service chỉ select cột của `AuthUser`, controller parse lại bằng `AuthUser` trước khi trả.

## Chưa làm (ghi ở "Học nâng cao" trong roadmap)

CSRF token, chặn brute-force login, xoay session sau khi đăng nhập/đổi quyền, xoá session hết hạn định kỳ, OIDC.

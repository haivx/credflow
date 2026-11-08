# 36 · Đăng ký và đăng nhập bằng Google (OAuth)

Phase: P6a · Trạng thái: Đã duyệt · Ngày: 2026-11-08

## Mục tiêu
Người xem bản demo công khai bấm "Tiếp tục với Google" là có ngay một tài khoản **staff** riêng để thử upload, không phải dùng chung tài khoản seed. Đăng nhập email + mật khẩu vẫn giữ nguyên cho tài khoản seed (reviewer, admin, staff demo).

Liam chốt 2026-11-08: mọi Gmail đều đăng ký được, nhận vai trò staff; giữ đăng nhập mật khẩu song song.

## Bước 0 · Sản phẩm (trước code)
- `docs/product.md`: bỏ "đăng ký tài khoản, SSO/OIDC" khỏi mục Ngoài; mục Đăng nhập thêm "staff tự đăng ký bằng Google (OAuth/OIDC); reviewer, admin chỉ do seed tạo".
- `docs/decisions/0015-dang-ky-google.md`: bổ sung ADR 0004. Ghi lý do dùng `google-auth-library` (không Passport), không tự liên kết email đã có, trần đăng ký mỗi ngày.

## Phạm vi
- Trong:
  1. **Luồng OAuth authorization code + PKCE** (server làm hết, trình duyệt không thấy token Google):
     - `GET /auth/google`: tạo `state` + `code_verifier`, cất vào cookie `httpOnly` ngắn hạn (10 phút, ký bằng HMAC), redirect sang Google (scope `openid email profile`).
     - `GET /auth/google/callback`: kiểm `state` khớp cookie → đổi `code` lấy token → `verifyIdToken` (audience = client ID) → yêu cầu `email_verified = true` → tìm user theo `google_sub`.
     - Đã có → tạo session như đăng nhập thường (dùng lại `AuthService`), redirect về `/`.
     - Chưa có → tạo **trong một transaction**: hồ sơ `staff` (`legalName` = tên Google, `role = caregiver`, `clientIds = []` → config `default`, `region` mặc định) + `users` (`role = staff`, `google_sub`, `password_hash = null`), rồi tạo session.
     - Email đã có tài khoản mật khẩu mà chưa gắn Google → **không tự liên kết**, quay về `/login?error=email_exists`.
     - Lỗi (state sai, user bấm Huỷ, token sai) → `/login?error=google_failed`, không lộ chi tiết.
  2. **Trần đăng ký:** `SIGNUP_DAILY_CAP` (mặc định 20 tài khoản mới mỗi ngày, đếm trong DB như trần upload plan 34) → vượt thì `/login?error=signup_closed`. Rate limit plan 34 vẫn áp cho upload.
  3. **DB** (migration 0009): `users.password_hash` cho phép null; thêm `users.google_sub` (unique, null được); CHECK có ít nhất một trong hai; CHECK `google_sub` chỉ cho `role = 'staff'` (admin/reviewer không bao giờ vào bằng Google).
  4. **Đăng nhập mật khẩu:** user không có `password_hash` → vẫn trả 401 cùng câu cũ, vẫn chạy scrypt giả (không lộ email nào là tài khoản Google).
  5. **Env** (tuỳ chọn, cả nhóm hoặc không): `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URL` (ví dụ `https://web-…/api/auth/google/callback`, đi qua rewrite `/api` của Next nên cookie cùng domain web), `OAUTH_STATE_SECRET`. Thiếu → `GET /auth/providers` trả `{google: false}`, endpoint Google trả 404, nút không hiện.
  6. **Web:** nút "Tiếp tục với Google" trên `LoginForm` (link thường tới `/api/auth/google`, không fetch); hiện câu lỗi theo `?error=`; câu nhỏ "Tài khoản Google mới là tài khoản nhân viên demo".
- Ngoài: liên kết Google vào tài khoản mật khẩu có sẵn; Google cho reviewer/admin; nhà cung cấp khác (GitHub, Microsoft); xoá tài khoản, quên mật khẩu; màn quản lý user cho admin; chọn khách hàng/vai trò khi đăng ký.

## Thay đổi
| File | Thay đổi |
| --- | --- |
| `packages/contracts/src/auth.ts` (+ test) | `AuthProviders { google: boolean }`; `AuthUser` không đổi |
| `apps/api/src/db/schema.ts`, `apps/api/drizzle/0009_*.sql` | cột `google_sub`, `password_hash` null được, 2 CHECK |
| `apps/api/src/config/env.schema.ts` (+ spec) | 4 biến Google + `SIGNUP_DAILY_CAP` |
| `apps/api/src/auth/google/*` (mới) | `google-oauth.client.ts` (bọc `google-auth-library`, provider tiêm được), `oauth-state.ts` (cookie state/PKCE ký HMAC, + spec), `google-auth.service.ts`, `google-auth.controller.ts` |
| `apps/api/src/auth/auth.service.ts` | tách `createSession(userId)` dùng chung; login bỏ qua user không có mật khẩu |
| `apps/api/package.json`, `pnpm-lock.yaml` | thêm `google-auth-library` |
| `apps/api/test/google-auth.int-spec.ts` (mới) | xem Verification |
| `apps/web/app/_components/LoginForm.tsx`, `_lib/queries.ts`, `_lib/status.ts` (câu lỗi) | nút Google, câu lỗi |
| `.env.example`, `.claude/skills/verify/FEATURE_MAP.md`, `docs/product.md`, `docs/decisions/0015-*.md` | biến mới, tài liệu |

## Vùng kiến trúc bị chạm
- `packages/contracts/src/**`
- `apps/api/src/db/schema.ts`
- `apps/api/drizzle/**`
- `**/package.json`
- `.claude/skills/verify/**`

## Contract / config / prompt bị ảnh hưởng
- **Contract:** thêm `AuthProviders` (chỉ thêm).
- **Schema DB:** `users.password_hash` từ NOT NULL thành null được; thêm `google_sub`. User seed cũ không đổi.
- Không đổi prompt, model, rule. `eval-ci` phải giữ 0/44.

## Quyết định đáng nhớ
- Chỗ khó nhất: tin được ai đang đăng nhập. Phải kiểm đủ `state` (chống CSRF đăng nhập), PKCE, chữ ký + audience của `id_token`, và `email_verified`. Định danh user bằng `sub` của Google, không bằng email (email đổi được).
- Không tự liên kết theo email: nếu ai đó có Gmail trùng email tài khoản mật khẩu, tự gắn sẽ cho họ vào tài khoản người khác. Đổi lại người dùng phải chọn một cách đăng nhập.
- Loại Passport (`passport-google-oauth20`): thêm một lớp ma thuật (strategy, serialize) mà app đã có session riêng; `google-auth-library` gọi thẳng, dễ đọc hơn ở mức middle.
- Hỏng khi: redirect URL trên Google Console lệch với `GOOGLE_REDIRECT_URL` (lỗi `redirect_uri_mismatch`); app Google ở chế độ "Testing" thì chỉ email được thêm vào danh sách test mới đăng nhập được, phải publish app mới mở cho mọi Gmail.
- Ghi "Học nâng cao": OIDC discovery, liên kết nhiều nhà cung cấp, refresh token Google (app không cần vì chỉ dùng Google để xác minh danh tính).

## Tiêu chí xong
- [ ] Gmail mới → bấm nút → về app đã đăng nhập, vai trò staff, có hồ sơ staff mới; upload một thẻ CPR chạy đủ pipeline.
- [ ] Đăng nhập lại bằng cùng Google → đúng tài khoản cũ, không tạo thêm.
- [ ] State sai/thiếu, `email_verified=false`, token sai audience → không tạo user, không tạo session.
- [ ] Email trùng tài khoản mật khẩu → không liên kết, báo rõ.
- [ ] Quá `SIGNUP_DAILY_CAP` → báo đóng đăng ký; user cũ vẫn đăng nhập được.
- [ ] Thiếu env Google → nút ẩn, endpoint 404, đăng nhập mật khẩu không đổi.
- [ ] `make lint`, `typecheck`, `test`, `test-int`, `eval-ci` (0/44) xanh; evidence report.
- [ ] Sau merge: Liam tạo OAuth client trên Google Cloud Console (em hướng dẫn), đặt biến trên Railway, thử bằng Gmail thật.

## Rủi ro / câu hỏi
- Cookie state đi qua rewrite `/api` của Next: cần kiểm cookie `Set-Cookie` trên redirect 302 vẫn tới trình duyệt (đăng nhập hiện tại đã đi đường này, nên khả năng cao ổn).
- Google yêu cầu trang chính sách quyền riêng tư khi publish app ngoài chế độ Testing; có thể để Testing + thêm vài Gmail test trước.
- Tên Google dùng làm `legalName`: thẻ CPR giả lập in tên khác thì ra `NAME_MISMATCH` → hàng chờ. Đúng hành vi (không tự duyệt khi tên lệch), nhưng người thử demo cần biết; ghi vào câu dưới nút.
- Kiểm cú pháp `google-auth-library` (`generateAuthUrl`, `getToken` với `codeVerifier`, `verifyIdToken`) bằng Context7 lúc code.

## Verification plan

**Mức rủi ro:** T2. Thêm đường tạo tài khoản và session (bảo mật); không đổi rule, routing, LLM.

**Hành vi kỳ vọng:**
- Người mới bấm "Tiếp tục với Google", chọn tài khoản → vào thẳng trang nhân viên của họ.
- Lần sau bấm lại → vào đúng tài khoản cũ.
- Bấm Huỷ ở Google → quay về trang đăng nhập với câu báo.
- Tài khoản seed vẫn đăng nhập bằng mật khẩu như cũ.

**Các mức kiểm:**
- [ ] L0: `make lint`, `make typecheck`, `next build`.
- [ ] L1 (`make test`): `oauth-state` (ký/kiểm, hết hạn, sửa 1 ký tự → từ chối); env nhóm Google thiếu một biến → lỗi; contract `AuthProviders`.
- [ ] L2 (`make test-int`, Google giả qua provider tiêm được): user mới → tạo staff + user + session trong 1 transaction; lần 2 → không tạo thêm; state sai/thiếu → 400/redirect lỗi, 0 dòng mới; `email_verified=false` → từ chối; email trùng → `email_exists`, user cũ không đổi; quá trần → `signup_closed`; login mật khẩu với user Google → 401 cùng câu; CHECK DB: reviewer có `google_sub` → lỗi constraint; thiếu env → `/auth/providers` false, `/auth/google` 404.
- [ ] L2 thật: `up.sh` với env Google giả → `curl -i /api/auth/google` trả 302 tới `accounts.google.com` có `code_challenge`, `state`, cookie state `HttpOnly`.
- [ ] L2 Eval: `make eval-ci` 0/44.
- [ ] L3: `ui.mts`: trang đăng nhập có nút Google khi bật, ẩn khi tắt; `?error=email_exists` hiện đúng câu. Screenshot.
- [ ] L4: Liam đăng nhập bằng Gmail thật (local hoặc Railway) sau khi tạo OAuth client.

**Test mới phải đỏ trên code cũ:** mỗi spec chạy trước khi có module → đỏ; ca "email_verified=false" đỏ nếu bỏ dòng kiểm; ca "state sai" đỏ nếu bỏ so state.

**Thay đổi feature map:** mục mới "Đăng ký bằng Google".

**Những gì sẽ KHÔNG kiểm, và lý do:**
- Đăng nhập Google thật từ đầu tới cuối: em không đăng nhập được tài khoản Google của anh; Liam làm ở L4.
- Chế độ publish app trên Google Console: việc cấu hình ngoài code.

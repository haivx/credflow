# 10 · Đăng nhập cơ bản: email + mật khẩu, session, guard theo vai trò

Phase: P1 · Trạng thái: Xong · Ngày: 2026-11-03

## Mục tiêu

API biết request đến từ user nào và vai trò gì. Route mặc định phải đăng nhập, sai vai trò thì bị chặn. Plan 11 (upload) lấy `staffId` từ user đang đăng nhập, không tin form gửi lên. Quyết định kiến trúc: ADR 0004.

## Quyết định đã chốt (Liam, 2026-11-03)

| # | Quyết định | Lý do |
| --- | --- | --- |
| 1 | Session lưu ở Postgres, không dùng JWT | Đăng xuất có hiệu lực ngay, xem ADR 0004 |
| 2 | Plan này chỉ làm API; màn login gộp với màn upload ở plan sau | Giữ PR nhỏ, web chưa có màn nào |
| 3 | **Liam không tự viết phần nào** ở plan này: luồng auth đơn giản, Claude code hết | Ngoại lệ của chế độ lai, Liam chốt. Claude vẫn giải thích các chỗ 🎓 và điền `progress.md` |
| 4 | Sửa spec: đăng nhập cơ bản vào MVP | Đã sửa `product.md`, `flows.md`, `roadmap.md` |

## Phạm vi

- Trong:
  - Contract auth.
  - Bảng `users`, `sessions` + migration.
  - Hash mật khẩu bằng scrypt.
  - `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`.
  - `AuthGuard` + `RolesGuard` toàn cục, decorator `@Public`, `@Roles`, `@CurrentUser`.
  - Gắn quyền cho route hiện có.
  - Seed user giả lập.
  - Test.
  - Note học.
- Ngoài: màn login web; đăng ký, đổi mật khẩu, quên mật khẩu; CSRF token; chặn brute-force; xoá session hết hạn định kỳ; OIDC (ghi ở "Học nâng cao"). Worker không đổi.

## Contract bị ảnh hưởng (cần Liam duyệt)

`packages/contracts/src/auth.ts` (mới):

```ts
export const UserRole = z.enum(["staff", "reviewer", "admin"]).meta({ id: "UserRole" });

/** Body của POST /auth/login. Email so sánh không phân biệt hoa thường (API chuẩn hoá về chữ thường). */
export const LoginRequest = z
  .strictObject({ email: z.email(), password: z.string().min(1).max(256) })
  .meta({ id: "LoginRequest" });

/** User đang đăng nhập: response của login và GET /auth/me. Không bao giờ chứa passwordHash. */
export const AuthUser = z
  .object({ id: Id, email: z.email(), role: UserRole, staffId: Id.nullable() })
  .meta({ id: "AuthUser" });
```

`packages/contracts/src/error.ts`: `ErrorCode` thêm `UNAUTHORIZED` (401), `FORBIDDEN` (403).

`AuthUser` thêm vào `Schemas` + fixture `fixtures/AuthUser.json`. `LoginRequest` không có fixture vì chứa mật khẩu; test dùng chuỗi giả.

## Schema DB bị ảnh hưởng (cần Liam duyệt)

| Bảng | Cột | Ràng buộc |
| --- | --- | --- |
| `users` (mới) | `id` text PK, `email` text, `password_hash` text, `role` text, `staff_id` text null, `created_at` | `email` unique; `CHECK (email = lower(email))`; `CHECK role IN (UserRole)`; FK `staff_id → staff.id` `restrict`; `CHECK ((role = 'staff') = (staff_id IS NOT NULL))` |
| `sessions` (mới) | `id` text PK, `user_id` text, `token_hash` text, `expires_at` timestamptz, `created_at` | FK `user_id → users.id` `ON DELETE CASCADE`; `token_hash` unique; `CHECK (token_hash ~ '^[0-9a-f]{64}$')`; index `user_id` |
| `review_actions` | `reviewer_id` | FK `→ users.id` `restrict` (Liam duyệt làm luôn, 2026-11-03) |

Ghi chú: user vai trò `staff` bắt buộc có `staffId`, reviewer và admin thì không được có. Cách này giữ được quy tắc "staff chỉ thấy giấy của mình" ở DB. Nếu sau này cần một người vừa là staff vừa là reviewer thì phải nới `CHECK`.

## Thiết kế

- **Mật khẩu** (`auth/password.ts`):
  - `hashPassword(plain)` → chuỗi `scrypt$N$r$p$<salt hex>$<hash hex>`, dùng N=16384, r=8, p=1, keylen 64. Tham số lưu luôn trong chuỗi để sau này tăng N mà không làm hỏng hash cũ.
  - `verifyPassword(plain, stored)` so sánh bằng `timingSafeEqual`.
  - Dùng `promisify(scrypt)` cho chạy async, không chặn event loop.
- **Login** (`AuthService.login`):
  - Chuẩn hoá email về chữ thường rồi tìm user.
  - Không thấy user thì vẫn chạy `verifyPassword` với một hash giả, để thời gian phản hồi không lộ "email có tồn tại". Sai email hay sai mật khẩu đều trả cùng một lỗi 401 `UNAUTHORIZED` "Email hoặc mật khẩu không đúng".
  - Đúng thì tạo session: `token = randomBytes(32).toString("base64url")`, lưu `sha256(token)`, `expiresAt = now + SESSION_TTL_DAYS`.
- **Cookie:** `credflow_session`, `httpOnly`, `sameSite: "lax"`, `path: "/"`, `secure: COOKIE_SECURE`, `maxAge` bằng TTL. Set bằng `res.cookie()` của Express (`@Res({ passthrough: true })`, giống `/ready`).
- **Đọc cookie:** middleware `cookie-parser` đăng ký trong `AppModule.configure()` (`NestModule`), không đăng ký trong `main.ts`. Lý do giống `APP_FILTER` ở plan 08: integration test dựng app từ `AppModule` cũng có middleware.
- **`AuthGuard`** (`APP_GUARD`):
  1. Route có `@Public()` thì cho qua (đọc bằng `Reflector.getAllAndOverride`).
  2. Đọc cookie → hash token → `SELECT` session JOIN user `WHERE token_hash = ? AND expires_at > now()`.
  3. Không có kết quả thì 401. Có thì gắn `request.user: AuthUser`.
- **`RolesGuard`** (`APP_GUARD`, đăng ký sau `AuthGuard` vì guard toàn cục chạy theo thứ tự đăng ký): route có `@Roles(...)` mà `request.user.role` không nằm trong danh sách thì 403. Không có `@Roles` thì mọi user đã đăng nhập đều qua.
- **`@CurrentUser()`:** param decorator (`createParamDecorator`) trả `request.user`. Thêm khai báo kiểu cho `Express.Request` để không phải dùng `any`.
- **Lỗi:** guard ném `UnauthorizedException`/`ForbiddenException`. Filter (plan 08) map 401/403 sang `ApiError` mã `UNAUTHORIZED`/`FORBIDDEN`, giống cách đang map 404.
- **Quyền của route hiện có:**

| Route | Quyền |
| --- | --- |
| `GET /health`, `GET /ready`, `POST /auth/login` | `@Public()` |
| `POST /auth/logout`, `GET /auth/me` | đã đăng nhập |
| `GET /staff`, `GET /staff/:id` | `@Roles("reviewer", "admin")` |

- **Env** (`env.schema.ts` + `.env.example`): `SESSION_TTL_DAYS` (mặc định 7), `COOKIE_SECURE` (boolean, mặc định `false`).
- **Seed:** 3 user giả lập, mỗi vai trò một user, mật khẩu dev dùng chung `credflow-dev`.
  - Email: `staff@example.test` gắn với một staff đã seed, `reviewer@example.test`, `admin@example.test`.
  - Ghi trong comment `seed-data.ts` và README phần dev. `onConflictDoNothing` theo email nên chạy lại không trùng.

## Thay đổi

| File / module | Thay đổi |
| --- | --- |
| `packages/contracts/src/auth.ts`, `error.ts`, `index.ts`, `fixtures/AuthUser.json` | Như mục contract |
| `apps/api/src/db/schema.ts`, `apps/api/drizzle/<mới>.sql` | Bảng `users`, `sessions` + FK `review_actions.reviewer_id`; `make db-generate` |
| `apps/api/src/auth/password.ts` (+ `.spec.ts`) | `hashPassword`, `verifyPassword` |
| `apps/api/src/auth/session-token.ts` (+ `.spec.ts`) | `newSessionToken()`, `hashSessionToken(token)` |
| `apps/api/src/auth/auth.service.ts` | `login`, `logout`, `findUserBySessionToken` |
| `apps/api/src/auth/auth.controller.ts` | 3 endpoint |
| `apps/api/src/auth/auth.guard.ts`, `roles.guard.ts` (+ `.spec.ts`) | Như thiết kế |
| `apps/api/src/auth/decorators.ts` | `@Public`, `@Roles`, `@CurrentUser` |
| `apps/api/src/auth/auth.module.ts`, `apps/api/src/app.module.ts` | Đăng ký module, 2 `APP_GUARD`, middleware `cookie-parser` |
| `apps/api/src/common/all-exceptions.filter.ts` (+ spec) | Map 401/403 |
| `apps/api/src/health/*.controller.ts`, `apps/api/src/staff/staff.controller.ts` | `@Public` / `@Roles` |
| `apps/api/src/config/env.schema.ts` (+ spec), `.env.example` | 2 biến mới |
| `apps/api/scripts/seed-data.ts`, `seed.ts` | Seed user |
| `apps/api/package.json` | thêm `cookie-parser`, `@types/cookie-parser` |
| `apps/api/test/auth.int-spec.ts` (mới), `test/helpers` | Test login/logout/me/guard; helper `loginAs(app, role)` trả cookie |
| `apps/api/test/staff.int-spec.ts` | Đăng nhập reviewer trước khi gọi; thêm case 401, 403 |
| `docs/learning/notes/p1-auth-session.md` | Note học (xem dưới) |
| `docs/learning/progress.md` | Thêm 3 dòng P1 (đăng nhập), điền `code:`/`note:`, không tick |
| `CLAUDE.md` | Mục cấu trúc/lệnh nếu có thay đổi (thêm biến env vào phần dev nếu cần) |

## 🎓 Giải thích (Claude viết, Liam đọc)

Note `p1-auth-session.md` gồm:

1. Vì sao mật khẩu cần hash chậm có salt, còn session token chỉ cần sha256.
2. Session so với JWT: vì sao CredFlow chọn session.
3. Các cờ cookie `httpOnly`, `SameSite`, `Secure` chống được gì và không chống được gì.
4. Guard nằm ở đâu trong vòng đời request, `Reflector` đọc metadata thế nào, vì sao mặc định chặn.
5. 401 khác 403.

Ba dòng mới trong `progress.md`, mỗi dòng có câu "Tự kiểm":

- **Lưu mật khẩu và session token.** Tự kiểm: Vì sao dùng sha256 cho session token được mà cho mật khẩu thì không? Salt chống được kiểu tấn công nào?
- **Session + cookie.** Tự kiểm: Cookie thiếu `httpOnly` thì kẻ tấn công làm được gì? Đăng xuất với session khác gì với JWT?
- **Guard + metadata, 401/403.** Tự kiểm: Quên gắn decorator lên route mới thì chuyện gì xảy ra? Vì sao `RolesGuard` phải chạy sau `AuthGuard`?

## Test và cách kiểm tra

- **Unit test:**
  - `hashPassword`/`verifyPassword`: đúng, sai, cùng mật khẩu ra hai hash khác nhau, chuỗi lưu hỏng thì trả `false` (không throw).
  - Token: độ dài, hash 64 hex.
  - `AuthGuard`, `RolesGuard` với `ExecutionContext` giả lập: route `@Public`, không có cookie, session không tồn tại, đúng vai trò, sai vai trò.
  - Filter: 401/403 ra `ApiError`.
  - Env: 2 biến mới.
- **Integration test** (`make test-int`):
  - Login đúng: 200, body parse được bằng `AuthUser`, có `Set-Cookie` với `HttpOnly` và `SameSite=Lax`, body không chứa `passwordHash`.
  - Sai mật khẩu và email không tồn tại cùng ra 401, body giống nhau.
  - Body sai (thiếu `password`, key lạ): 400.
  - `/auth/me`: không có cookie thì 401, có cookie thì 200.
  - Logout xong dùng lại cookie cũ thì 401 (session bị xoá trong DB).
  - Session đã hết hạn (set `expires_at` về quá khứ) thì 401.
  - `/staff`: chưa đăng nhập 401, đăng nhập vai trò staff 403, reviewer 200.
  - `/health`, `/ready` không cần cookie.
  - Ràng buộc DB: user vai trò `staff` mà không có `staffId` thì bị từ chối; reviewer có `staffId` cũng bị từ chối; email chữ hoa bị từ chối.
- **Eval:** không cần (không đụng prompt, model, rule).
- **Kiểm tra tay:** `make setup` (có seed user), `make dev-api`, rồi `curl -i -c jar -H 'content-type: application/json' -d '{"email":"reviewer@example.test","password":"credflow-dev"}' localhost:8787/auth/login`, sau đó `curl -b jar localhost:8787/staff`.

## Tiêu chí xong

- [x] Contract `UserRole`, `LoginRequest`, `AuthUser`, `ErrorCode` mới; fixture parse được
- [x] Migration tạo `users`, `sessions` với đủ ràng buộc ở trên; `make setup` chạy lại an toàn, có seed 3 user
- [x] Route không gắn `@Public` mà chưa đăng nhập thì 401, sai vai trò thì 403, body là `ApiError` (có test)
- [x] Logout làm cookie cũ vô hiệu ngay; session hết hạn bị từ chối (có test)
- [x] DB không bao giờ lưu mật khẩu hay token dạng thô; response không bao giờ chứa `passwordHash`
- [x] `make test`, `make test-int`, `make typecheck`, `make lint` pass; CI xanh
- [x] Note học + `progress.md` (3 dòng mới, điền `code:`/`note:`), STATUS cập nhật; ADR 0004 chuyển sang "Chấp nhận" khi Liam duyệt plan

## Rủi ro / câu hỏi

1. ~~FK `review_actions.reviewer_id → users.id`~~ Liam chốt làm luôn ở plan này.
2. **Cross-site cookie khi làm web:** web chạy `localhost:3000` gọi API `127.0.0.1:8787` thì cookie `SameSite=Lax` không được gửi kèm. Plan màn login/upload sẽ dùng Next `rewrites` proxy `/api/*`. Ghi ở đây để không bị bất ngờ, plan này chưa xử lý.
3. **Mật khẩu dev chung `credflow-dev`:** chỉ dùng trên máy dev và demo với dữ liệu giả lập. Khi deploy demo (P6) phải đổi qua env, ghi việc này vào plan P6.

## Ghi chú khi làm

- `COOKIE_SECURE` dùng `z.stringbool()`, không dùng `z.coerce.boolean()` (chuỗi `"false"` sẽ thành `true`).
- Không khai báo thêm kiểu cho `Express.Request` (cần `declare global namespace`, bị lint chặn). Thay bằng kiểu `AuthedRequest = Request & { user?: AuthUser }` trong `auth/decorators.ts`.
- `cookie-parser` đăng ký bằng `forRoutes("{*splat}")`: Nest 12 dùng path-to-regexp v8, dấu `*` trơn không dùng được nữa (docs Nest, Context7).
- Thứ tự `APP_GUARD` đặt trong `AuthModule` (AuthGuard rồi RolesGuard), có comment.
- `db-constraints.int-spec.ts`: review action giờ cần reviewer thật (FK mới); thêm test FK reviewer và 5 test ràng buộc `users`.
- Kiểm tay trên DB dev: migrate + seed hai lần (lần 2 bỏ qua 3 user), login reviewer → `/staff` 200; không cookie → 401; logout → 204; cookie cũ → 401.
- CI: chờ push PR.


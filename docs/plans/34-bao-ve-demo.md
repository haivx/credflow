# 34 · Bảo vệ demo: rate limit, trần upload mỗi ngày, tự xoá file cũ, đặt lại mật khẩu demo, chặn khoảng trắng thừa (P6a)

Phase: P6a · Trạng thái: Đã duyệt · Ngày: 2026-11-08

## Context
CredFlow đã chạy công khai trên Railway (`web-production-5b171.up.railway.app`). Ai có mật khẩu demo có thể upload liên tục: mỗi lần tốn một lượt gọi Claude và chỗ trên bucket, app chưa có trần nào. Ngoài ra: quên mật khẩu demo thì chỉ còn cách xoá user (không làm được khi đã có `review_actions`); và trong lúc dựng Railway, Liam gặp 4 lần lỗi do khoảng trắng/ký tự thừa khi dán biến, lỗi lộ ra khó hiểu.

Liam chốt 2026-11-08: thêm mã lỗi `TOO_MANY_REQUESTS` vào contract; chỉ xoá **file** (giữ dòng DB) sau **3 ngày**; mức giới hạn **chặt**.

Kết quả: một người hay một tài khoản bị lộ không đốt được quá ~50 lượt Claude/ngày; file demo không tồn tại quá 3 ngày; Liam đặt lại được mật khẩu demo bằng một lệnh; biến môi trường dính khoảng trắng bị chặn ngay lúc khởi động/build với câu báo rõ.

Song song (Liam tự làm, không thuộc code): lên Hobby + Usage Limits, trần chi tiêu Anthropic, backup Postgres + thử khôi phục.

## Phạm vi
- Trong:
  1. **Rate limit** (`@nestjs/throttler@6.7.1`, phát hành 2026-09-24, peer hỗ trợ Nest 12):
     - Đăng nhập: **5 lần / 15 phút theo email** (chữ thường). Không theo IP: request đi qua Railway edge rồi Next rewrite trước khi tới `api`, IP thật nằm trong `X-Forwarded-For` do proxy ghép, giả được; rủi ro thật là đoán mật khẩu một tài khoản, khoá theo email chặn đúng chỗ đó.
     - Upload: **10 lần / giờ theo user** (id trong session).
     - Bộ đếm trong bộ nhớ process `api` (1 replica). Nhiều replica cần lưu bộ đếm ở Redis: ghi "Học nâng cao".
  2. **Trần upload toàn hệ thống: 50 / ngày (UTC)**: đếm `documents` tạo từ 00:00 UTC hôm nay; đủ thì từ chối **trước khi** nhận file. Nộp trùng (sha256 đã có) không tạo dòng mới nên không tính. Đây là trần chi phí Claude (~$0.0007/giấy → tối đa ~$0.04/ngày).
  3. **429 có mã riêng:** `ErrorCode` thêm `TOO_MANY_REQUESTS`; `AllExceptionsFilter` map 429 → mã đó; web hiện câu tiếng Việt (đăng nhập và upload).
  4. **Tự xoá file sau 3 ngày** (`FILE_RETENTION_DAYS=3`, `0` = tắt): job định kỳ mỗi giờ trong `worker` (cùng kiểu job scheduler của sweep, `apps/api/src/worker/document-worker.service.ts`): giấy tạo quá N ngày và chưa xoá file → `storage.remove(storageKey)` → ghi `file_deleted_at`. Xử lý theo lô 100, chạy lại an toàn. Dòng DB, kết quả đọc, lịch sử duyệt giữ nguyên. API trả file đã xoá → 404 như hiện tại; `FileViewer` (web) bắt lỗi ảnh/PDF không tải được và hiện "File đã được xoá sau 3 ngày theo chính sách demo".
  5. **Đặt lại mật khẩu demo:** `apps/api/scripts/reset-demo-password.ts` (`pnpm --filter @credflow/api db:reset-demo-password`): dùng `resolveSeedPassword` (cùng luật plan 33), cập nhật `password_hash` cho đúng các email trong `seedUsers`, xoá session của các user đó (đăng xuất mọi nơi). Không động tới dữ liệu khác.
  6. **Chặn khoảng trắng thừa:** `appEnvSchema` báo lỗi khi bất kỳ biến dạng chuỗi nào có khoảng trắng ở đầu/cuối (vd `API_HOST=" ::"` → "API_HOST có khoảng trắng ở đầu hoặc cuối"). `apps/web/next.config.mjs` kiểm `API_URL` (có khoảng trắng, hoặc không phải URL `http(s)://`) → dừng build với câu báo nêu tên biến.
- Ngoài: CAPTCHA, khoá tài khoản tạm thời, bộ đếm trên Redis; xoá cả dòng document; đổi mật khẩu từng user; S2/S3 làm lại (plan 31).

## Thay đổi
| File | Thay đổi |
| --- | --- |
| `packages/contracts/src/error.ts` (+ test) | thêm `TOO_MANY_REQUESTS` (429) |
| `apps/api/src/common/all-exceptions.filter.ts` | `429 → TOO_MANY_REQUESTS` |
| `apps/api/src/config/env.schema.ts` (+ spec) | `LOGIN_RATE_LIMIT=5`, `LOGIN_RATE_WINDOW_MIN=15`, `UPLOAD_RATE_PER_HOUR=10`, `DAILY_UPLOAD_CAP=50`, `FILE_RETENTION_DAYS=3`; kiểm khoảng trắng trong `appEnvSchema` |
| `apps/api/src/rate-limit/*` (mới) | module throttler; tracker theo email (login), theo user id (upload) |
| `apps/api/src/auth/auth.controller.ts`, `documents/documents.controller.ts` | gắn giới hạn |
| `apps/api/src/documents/documents.service.ts` | `assertDailyUploadQuota(now)` trước khi nhận file |
| `apps/api/src/db/schema.ts` + `apps/api/drizzle/0007_*.sql` (sinh bằng `make db-generate`) | cột `documents.file_deleted_at timestamptz null` |
| `apps/api/src/worker/file-retention.service.ts` (mới) + `document-worker.service.ts` | job mỗi giờ |
| `apps/api/scripts/reset-demo-password.ts` (mới), `apps/api/package.json` | script + `db:reset-demo-password` |
| `apps/api/test/test-env.ts` | giới hạn cao cho test-int cũ (tránh test cũ đụng 429) |
| `apps/api/test/rate-limit.int-spec.ts`, `file-retention.int-spec.ts`, `reset-demo-password.int-spec.ts` (mới) | xem Verification |
| `apps/web/app/_lib/status.ts` (+ test), `LoginForm.tsx`, `FileViewer.tsx` | câu báo 429; file đã xoá |
| `apps/web/next.config.mjs` | kiểm `API_URL` |
| `.env.example`, `Makefile` (`db-reset-demo-password`), `CLAUDE.md` (mục Lệnh), `.claude/skills/verify/FEATURE_MAP.md` | biến mới, lệnh mới |
| `docs/roadmap.md` | "Học nâng cao": bộ đếm rate limit trên Redis khi nhiều replica; IP thật sau proxy |

## Vùng kiến trúc bị chạm
- `packages/contracts/src/**`
- `apps/api/src/db/schema.ts`
- `apps/api/drizzle/**`
- `apps/api/package.json`
- `Makefile`
- `CLAUDE.md`
- `.claude/skills/verify/**`

## Contract / config / prompt bị ảnh hưởng
- **Contract:** `ErrorCode` thêm `TOO_MANY_REQUESTS` (chỉ thêm, Liam đã duyệt 2026-11-08). Client cũ nhận mã lạ: web parse `ApiError` bằng schema mới nên phải deploy `web` cùng lúc (cùng commit, Railway deploy cả hai).
- **Schema DB:** thêm cột null `documents.file_deleted_at` (migration chỉ `ADD COLUMN`, không khoá lâu, bản `api` cũ vẫn chạy được với cột mới).
- Không đổi rule, prompt, model.

## Quyết định đáng nhớ
- Chỗ khó nhất: xác định "ai" để đếm khi app nằm sau 2 lớp proxy. Login đếm theo email, upload theo user id (đã đăng nhập), trần ngày đếm trong DB: cả ba không phụ thuộc IP.
- Trần ngày đếm bằng `count(*)` trên `documents` thay vì bộ đếm riêng: một nguồn sự thật, không lệch khi `api` khởi động lại; có race nhỏ (2 upload cùng lúc ở ngưỡng có thể vượt 1), chấp nhận ở quy mô demo.
- Cần cột `file_deleted_at` để job không xoá đi xoá lại cùng file mỗi giờ; đã loại cách "cửa sổ thời gian" không cần cột (worker tắt lâu hơn cửa sổ thì bỏ sót file).
- Hỏng khi: chạy `api` nhiều replica (mỗi replica một bộ đếm → giới hạn thực tế nhân lên); kẻ xấu thử nhiều email khác nhau (mỗi email 5 lần) vẫn bị trần ngày và việc phải có mật khẩu đúng chặn lại.
- Mức middle: throttler trong bộ nhớ, job scheduler BullMQ có sẵn. Ghi "Học nâng cao": bộ đếm trên Redis, IP thật sau proxy (`trust proxy`, chuỗi `X-Forwarded-For`).

## Tiêu chí xong
- [ ] Đăng nhập sai lần thứ 6 trong 15 phút với cùng email → 429 `TOO_MANY_REQUESTS`; email khác vẫn đăng nhập được.
- [ ] Upload thứ 11 trong 1 giờ của cùng user → 429; user khác vẫn upload được.
- [ ] Đủ 50 giấy hôm nay → upload mới 429, chưa ghi file tạm nào.
- [ ] Giấy quá 3 ngày → file bị xoá khỏi storage, `file_deleted_at` có giá trị, dòng DB còn; giấy mới hơn giữ nguyên; chạy job 2 lần không lỗi.
- [ ] `db:reset-demo-password` đổi được mật khẩu 6 user demo, session cũ hết hiệu lực; database không local mà thiếu/yếu `SEED_PASSWORD` → từ chối.
- [ ] `API_HOST=" ::"` → API không khởi động, câu báo nêu tên biến; `API_URL=" http://…"` → `next build` dừng với câu báo của mình.
- [ ] `make lint`, `make typecheck`, `make test`, `make test-int`, `make eval-ci` xanh.
- [ ] Evidence report trong PR. Sau merge: Liam kiểm trên Railway (bài bảo vệ demo).

## Rủi ro / câu hỏi
- Test-int cũ đăng nhập rất nhiều lần: `test-env.ts` đặt giới hạn cao; test rate limit dựng app riêng với giới hạn thấp.
- Migration 0007 chạy bằng pre-deploy trên Railway lần deploy kế tiếp (đã có cơ chế).
- Code ở worktree riêng `../credflow-34` (nhánh `feat/34-bao-ve-demo` từ `main`), `COMPOSE_PROJECT_NAME=credflow`.

## Verification plan

**Mức rủi ro:** T2. Thêm giới hạn và job dọn file, đổi contract (thêm mã lỗi) và schema (thêm cột null). Không đổi rule, routing, đường ra quyết định.

**Hành vi kỳ vọng (theo cách người dùng nói):**
- Ai đoán mật khẩu một tài khoản quá 5 lần trong 15 phút thì bị chặn, thấy câu "thử lại sau ít phút".
- Một tài khoản upload quá 10 lần một giờ, hoặc cả hệ thống quá 50 giấy một ngày, thì upload bị từ chối với câu rõ ràng; tiền Claude không vượt trần.
- Giấy nộp quá 3 ngày vẫn còn kết quả và lịch sử duyệt, nhưng ảnh/PDF không còn; màn hình nói rõ vì sao.
- Quên mật khẩu demo thì Liam chạy một lệnh để đặt lại.
- Dán biến môi trường có dấu cách thừa thì deploy/build dừng ngay, log nêu đúng tên biến.

**Các mức kiểm:**
- [ ] L0: `make lint`, `make typecheck`.
- [ ] L1 (`make test`): env schema (khoảng trắng, giá trị mặc định mới); contract `TOO_MANY_REQUESTS`; web `uploadErrorMessage`/câu đăng nhập cho 429.
- [ ] L2 (`make test-int`): `rate-limit.int-spec.ts` (login theo email, upload theo user, trần ngày), `file-retention.int-spec.ts` (với `LocalStorage`; quá hạn/chưa quá hạn/đã xoá/chạy lại), `reset-demo-password.int-spec.ts` (đổi hash 6 user, xoá session, không đụng user khác); toàn bộ test cũ xanh.
- [ ] L2 thật: `up.sh` với `DAILY_UPLOAD_CAP=2`: upload lần 3 → 429 qua `api.sh`; `db:reset-demo-password` trên DB dev rồi đăng nhập bằng mật khẩu mới qua `api.sh` (sau đó đặt lại `credflow-dev`).
- [ ] L2 Eval: không đổi prompt/model/rule → `make eval-ci`.
- [ ] L3: `ui.mts` đăng nhập sai 6 lần → `login-error` chứa câu 429; reviewer mở giấy đã xoá file → câu "File đã được xoá…".
- [ ] L4: không.

**Kịch bản sẽ chạy:**
| # | Kịch bản | Input | Kết quả kỳ vọng |
|---|---|---|---|
| 1 | đoán mật khẩu | 6 lần sai cùng email | lần 6: 429 `TOO_MANY_REQUESTS`; email khác: 401 bình thường |
| 2 | upload dồn | 11 upload cùng user (test) | lần 11: 429; user khác 201 |
| 3 | trần ngày | `DAILY_UPLOAD_CAP=2`, upload lần 3 | 429, không có file mới trong `DATA_DIR/tmp` |
| 4 | dọn file | giấy `created_at` = 4 ngày trước + giấy hôm nay | file giấy cũ bị xoá, `file_deleted_at` có; giấy mới còn file; chạy lần 2 không lỗi |
| 5 | xem giấy đã xoá file | reviewer mở giấy ở kịch bản 4 | API 404; web hiện câu "File đã được xoá…" |
| 6 | đặt lại mật khẩu | `SEED_PASSWORD=<mới>` + script | đăng nhập mới được, cũ 401, session cũ 401 |
| 7 | khoảng trắng | `API_HOST=" ::"`; `API_URL=" http://x"` khi build web | API exit 1 nêu `API_HOST`; build web dừng nêu `API_URL` |

**Test mới phải đỏ trên code cũ:** mỗi file int-spec mới chạy trên `main` → đỏ (chưa có giới hạn/job/script); env khoảng trắng: bỏ đoạn kiểm → đỏ; contract: test `TOO_MANY_REQUESTS` đỏ trước khi thêm.

**Thay đổi feature map:** mục Đăng nhập (giới hạn theo email), Upload (theo user, trần ngày), mục mới "Dọn file" (job, `FILE_RETENTION_DAYS`), "Đặt lại mật khẩu demo".

**Những gì sẽ KHÔNG kiểm, và lý do:**
- Railway thật: Liam kiểm sau merge trong bài bảo vệ demo (Claude không thao tác tài khoản Railway).
- Nhiều replica `api`: ngoài phạm vi (1 replica).
- Đếm upload theo IP / tấn công dùng nhiều email: chặn bằng trần ngày, không kiểm riêng.

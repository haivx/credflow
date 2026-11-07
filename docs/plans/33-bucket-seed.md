# 33 · Lưu file trên Railway Bucket (S3) và seed bằng mật khẩu từ env (P6a)

Phase: P6a · Trạng thái: Đã duyệt · Ngày: 2026-11-07

## Context
Liam đang tự deploy CredFlow lên Railway (dạy từng bước). `api` đã chạy, đã migrate (pre-deploy). Hai chỗ code chặn bước tiếp theo:
1. **File upload nằm trên đĩa của `api`.** Trên Railway mỗi service là một container riêng, volume chỉ gắn một service → `worker` không đọc được file → mọi giấy thành `failed`. Liam chọn **Railway Bucket** (tương thích S3, cùng project, key gắn bằng reference variable) thay R2 (2026-11-07).
2. **Seed đặt cứng mật khẩu `credflow-dev`** (`apps/api/scripts/seed-data.ts`). Seed lên database production thì ai đọc repo cũng đăng nhập được.

Kết quả: `api` và `worker` đọc/ghi file qua bucket khi `STORAGE_DRIVER=s3`; máy dev vẫn dùng đĩa như cũ. Seed từ chối mật khẩu dev khi database không phải máy local.

Số plan: 31, 32 để dành cho P4.5 (S2/S3, bàn phím); P6a bắt đầu từ 33. Plan 33 "đóng gói Docker" bản nháp trước **bỏ**: Railpack build được monorepo không cần Dockerfile (đã kiểm khi deploy `api`).

## Bước 0 · Docs (PR #52, worktree `../credflow-docs`, push thường)
- `docs/decisions/0013-…`: viết lại → `0013-deploy-railway.md`: Railway (web/api/worker/Postgres/Redis + Bucket, region Singapore); chỉ `web` công khai, web gọi `api.railway.internal` qua rewrite (ADR 0004 giữ nguyên); migration bằng pre-deploy; Railpack build (không Dockerfile); Watch Paths theo service; Wait for CI; Trial → Hobby + Usage Limits. Phương án loại: VPS DigitalOcean, Vercel+Railway+Supabase, serverless thuần, R2 (cùng giá, thêm một tài khoản).
- `docs/product.md` (Lưu file, Deploy), `docs/roadmap.md` (P6a viết lại cho Railway, bỏ phần VPS), `docs/research/deploy-options.md` (dòng quyết định), `docs/STATUS.md` (Railway: Postgres 18.6, Redis `noeviction` đã kiểm; `api` Active; migrate qua pre-deploy; việc tồn: Postgres dev 16 vs prod 18, Node dev 24 vs Railway 22).

## Phạm vi code
- Trong:
  - `S3Storage implements Storage` (`apps/api/src/storage/s3-storage.ts`, `@aws-sdk/client-s3@3.1156.0`, phát hành 2026-10-22):
    - `tmpDir` = `<os.tmpdir()>/credflow-upload` (đĩa tạm của container; upload vẫn stream ra file tạm để hash sha256 như plan 11).
    - `putFromTemp`: `PutObject` từ stream file tạm kèm `ContentLength`, thành công thì xoá file tạm.
    - `read`: `GetObject` → `Buffer`; key không có (`NoSuchKey`/404) → `null`.
    - `openRead`: `GetObject` → `Readable`; không có → `null`.
    - `remove`: `DeleteObject` (không có key cũng không lỗi).
    - Key chặn `..` và key rỗng như `LocalStorage.pathOf` (key luôn do server sinh).
  - Chọn storage theo env trong `storage.module.ts`: `STORAGE_DRIVER=local|s3` (mặc định `local`).
  - `env.schema.ts`: `STORAGE_DRIVER`, `S3_BUCKET`, `S3_ENDPOINT`, `S3_REGION` (mặc định `auto`), `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE` (stringbool, mặc định `false`); `s3` thiếu biến nào → không khởi động, báo đúng tên biến. Trên Railway: `S3_BUCKET=${{Bucket.BUCKET}}`… (Liam đặt ở bài 4).
  - Seed: hàm thuần `resolveSeedPassword({ SEED_PASSWORD, DATABASE_URL })` trong `apps/api/src/db/seed-password.ts` (đặt ở `src/` để vitest thấy spec, không phải sửa `vitest.config.ts`):
    - database ở máy local (`localhost`, `127.0.0.1`, `::1`) + không đặt biến → `credflow-dev` (dev như cũ);
    - database khác local + không đặt biến → lỗi "đặt SEED_PASSWORD";
    - database khác local + `SEED_PASSWORD=credflow-dev` → lỗi;
    - có biến hợp lệ → dùng biến (tối thiểu 12 ký tự khi không phải local).
    `seed.ts` dùng hàm này thay hằng `SEED_PASSWORD`.
  - Integration test chạy với S3 thật cục bộ: thêm service `s3-test` (image `adobe/s3mock`, tag cố định, cổng `127.0.0.1:9090`) vào `docker-compose.yml`; `make test-int` bật thêm nó. CI dùng `make test-int` nên tự có.
- Ngoài: service `worker`/`web`, biến trên Railway, seed production (Liam làm, bài 4–5b); rate limit, tự xoá file, trần chi tiêu (bài 9); presigned URL cho file (vẫn stream qua API, ADR 0005 giữ nguyên); đổi Postgres dev lên 18, khoá phiên bản Node (plan riêng).

## Thay đổi
| File | Thay đổi |
| --- | --- |
| `apps/api/src/storage/s3-storage.ts` (mới) | như trên |
| `apps/api/src/storage/storage.module.ts` | factory chọn `LocalStorage` / `S3Storage` theo `STORAGE_DRIVER` |
| `apps/api/src/storage/storage-contract.ts` (mới) | bộ ca kiểm dùng chung cho mọi `Storage` (put/read/openRead/remove/key không có/key `..`) |
| `apps/api/src/storage/local-storage.spec.ts` | chạy thêm bộ ca dùng chung (L1) |
| `apps/api/test/s3-storage.int-spec.ts` (mới) | bộ ca dùng chung trên `S3Storage` + s3mock (L2); bucket tạo/xoá trong test |
| `apps/api/test/test-env.ts` | env S3 cho test-int |
| `apps/api/src/config/env.schema.ts` (+ spec nếu có) | biến S3, `superRefine` khi `s3` |
| `apps/api/src/db/seed-password.ts` (mới) + `seed-password.spec.ts` | `resolveSeedPassword` + 5 ca |
| `apps/api/scripts/seed.ts`, `seed-data.ts` | dùng hàm mới; bỏ export hằng mật khẩu (giữ hằng mặc định dev trong hàm) |
| `apps/api/vitest.config.ts` | chỉ nếu cần cho spec trong `scripts/` (vùng kiến trúc) |
| `apps/api/package.json`, `pnpm-lock.yaml` | `@aws-sdk/client-s3@3.1156.0` (cố định) |
| `docker-compose.yml`, `Makefile` | service `s3-test`; `test-int` bật thêm |
| `.env.example` | khối biến S3 + `SEED_PASSWORD`, ghi chú Railway reference variable |
| `.claude/skills/verify/FEATURE_MAP.md` | mục Upload: driver s3, s3mock; mục seed |
| `CLAUDE.md` | mục Lệnh: `make test-int` bật thêm s3-test; `db-seed` cần `SEED_PASSWORD` khi DB không local |

## Vùng kiến trúc bị chạm
- `apps/api/package.json`
- `Makefile`
- `CLAUDE.md`
- `.claude/skills/verify/**`
- `apps/api/vitest.config.ts` (chỉ nếu phải thêm `scripts/**/*.spec.ts`; ưu tiên đặt spec ở `src/` để không chạm)

## Contract / config / prompt bị ảnh hưởng
Không. Không đổi `packages/contracts`, schema DB, rule, prompt, model. Interface `Storage` giữ nguyên.

## Quyết định đáng nhớ
- Chỗ khó nhất: giữ đúng hành vi của interface `Storage` trên hai nền khác nhau ("không có → null", "file tạm không còn sau putFromTemp"). Một bộ ca kiểm dùng chung chạy trên cả `LocalStorage` và `S3Storage` thay vì hai bộ test viết riêng dễ lệch nhau.
- Đã loại: presigned URL (nhanh hơn nhưng đổi luồng kiểm quyền file của plan 27, ngoài phạm vi); mock S3 client trong unit test làm bằng chứng chính (mock tự lặp lại chính nó, Rule 4) → dùng s3mock chạy thật; MinIO (cách phát hành image cộng đồng đã đổi, rủi ro tag biến mất).
- Bucket Railway chỉ có địa chỉ công khai: upload từ `api` tính egress service (~$0.05/GB, demo không đáng kể). Bucket mới dùng URL kiểu virtual-hosted; bucket cũ có thể cần path-style → `S3_FORCE_PATH_STYLE`.
- Hỏng khi: file lớn hơn `UPLOAD_MAX_BYTES` hiện tại cần multipart (`PutObject` một lần tối đa 5 GB, đủ xa); bucket mất mạng → upload trả 500 và file tạm được dọn như lỗi ghi đĩa hiện nay.

## Tiêu chí xong
- [ ] `STORAGE_DRIVER=s3` + s3mock: upload → worker đọc → tự duyệt, file nằm trong bucket, không nằm trên đĩa `DATA_DIR/files`.
- [ ] Bộ ca dùng chung xanh trên cả hai storage; `STORAGE_DRIVER=s3` thiếu biến → API không khởi động, lỗi nêu tên biến.
- [ ] Seed: 5 ca `resolveSeedPassword`; `make db-seed` trên máy dev chạy như cũ.
- [ ] `make lint`, `make typecheck`, `make test`, `make test-int`, `make eval-ci` xanh.
- [ ] Docs bước 0 trong PR #52.
- [ ] Evidence report trong PR. Kiểm trên Railway thật làm cùng Liam ở bài 4 (ghi vào evidence sau).

## Rủi ro / câu hỏi
- `adobe/s3mock` khác S3 thật ở vài chi tiết (lỗi trả về, checksum). Bằng chứng cuối là lần chạy trên Railway Bucket thật cùng Liam.
- Image s3mock khá nặng (Java), thêm vài giây cho `make test-int` và CI.
- Code ở worktree riêng `../credflow-33` (nhánh `feat/33-bucket-seed` từ `main`) để không đụng thư mục Liam đang chạy `make dev`.

## Verification plan

**Mức rủi ro:** T2. Đổi nơi lưu file (đường upload và worker đọc file), không đổi rule, routing, contract. Mặc định `local` nên máy dev và CI hiện tại không đổi hành vi.

**Hành vi kỳ vọng (theo cách người dùng nói):**
- Trên Railway, staff nộp thẻ CPR, worker (container khác) đọc được file và giấy được tự duyệt, như máy dev.
- Người duyệt mở giấy vẫn xem được ảnh/PDF.
- Quên đặt biến bucket thì API không khởi động và log nói thiếu biến nào.
- Seed lên database production mà quên đặt mật khẩu thì seed dừng, không tạo user `credflow-dev`.

**Các mức kiểm:**
- [ ] L0: `make lint`, `make typecheck`.
- [ ] L1 (`make test`): bộ ca dùng chung trên `LocalStorage`; `resolveSeedPassword` 5 ca; env schema: `s3` thiếu biến → lỗi có tên biến.
- [ ] L2 (`make test-int`): bộ ca dùng chung trên `S3Storage` + s3mock; toàn bộ test-int cũ xanh (mặc định local).
- [ ] L2 thật: `up.sh` với `STORAGE_DRIVER=s3` trỏ s3mock (cổng 9090): upload `01-expires.png` qua `api.sh` → `auto_approved`; `GET /review/documents/:id/file` trả đúng byte; `DATA_DIR/files` trống.
- [ ] L2 Eval: không đổi prompt/model/rule → `make eval-ci`.
- [ ] L3: `ui.mts` S1 nộp file khi `STORAGE_DRIVER=s3` → "Đã tự duyệt".
- [ ] L4: không.

**Kịch bản sẽ chạy:**
| # | Kịch bản | Input | Kết quả kỳ vọng |
|---|---|---|---|
| 1 | luồng chuẩn trên bucket | `STORAGE_DRIVER=s3`, staff-marisol nộp `01-expires.png` | `auto_approved`; object `documents/<id>.png` có trong bucket |
| 2 | xem file | reviewer `GET /review/documents/:id/file` (giấy chờ duyệt, ca 02) | 200, `Content-Type` đúng, byte khớp sha256 |
| 3 | key không có | `read`/`openRead` key lạ | `null` → API 404 |
| 4 | thiếu biến | `STORAGE_DRIVER=s3`, bỏ `S3_BUCKET` | API không khởi động, log có `S3_BUCKET` |
| 5 | seed production quên mật khẩu | `DATABASE_URL` host khác local, không `SEED_PASSWORD` | exit ≠ 0, câu lỗi rõ, không insert |
| 6 | seed dev | `make db-seed` | như cũ, idempotent |
| 7 | trùng file | nộp lại cùng file | 200 `duplicate: true`, không tạo object mới |

**Test mới phải đỏ trên code cũ:**
- `s3-storage.int-spec.ts`: chạy trước khi có `S3Storage` → đỏ; tạm bỏ nhánh `NoSuchKey → null` → ca "key không có" đỏ.
- `seed-password.spec.ts`: viết trước hàm → đỏ; bỏ điều kiện "khác local + credflow-dev" → ca đó đỏ.
- env schema: bỏ `superRefine` → ca thiếu biến đỏ.

**Thay đổi feature map:** mục Upload (driver `s3`, biến, s3mock cho test), mục seed (`SEED_PASSWORD`).

**Những gì sẽ KHÔNG kiểm, và lý do:**
- Railway Bucket thật: làm cùng Liam ở bài 4 (Claude không thao tác tài khoản Railway của Liam), ghi bổ sung vào evidence.
- File > 10 MB / multipart: ngoài giới hạn upload hiện tại.

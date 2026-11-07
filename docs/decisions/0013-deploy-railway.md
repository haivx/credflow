# 0013 · Deploy demo lên Railway, file lưu trên Railway Bucket

Trạng thái: Đã chốt · Ngày: 2026-11-07 · Nghiên cứu: `docs/research/deploy-options.md`

## Bối cảnh

Liam muốn deploy sớm (P6a, trước P5), giảm phức tạp vận hành và dùng thành thạo một nền tảng managed cho các app business sau này. Cùng ngày đã cân nhắc VPS DigitalOcean (tự quản lý server) rồi đổi sang Railway.

## Quyết định (Liam chốt 2026-11-07)

- **Một project Railway `credflow`**, environment `production`, region Singapore (`asia-southeast1`). Năm service: `web` (Next), `api` (Nest), `worker` (BullMQ, cùng code với `api`, lệnh `start:worker`), `Postgres`, `Redis` (template; đã kiểm `maxmemory-policy noeviction`).
- **Chỉ `web` có domain công khai.** `web` gọi `api` qua mạng nội bộ `api.railway.internal:8787` bằng rewrite `/api/*`, nên cookie vẫn cùng site như ADR 0004. `api` nghe `API_HOST=::` (mạng nội bộ IPv6).
- **Build bằng Railpack** từ gốc monorepo (không Dockerfile): build `pnpm install --frozen-lockfile && pnpm --filter "./packages/*" build && pnpm --filter <app> build`; start bằng script của app để thư mục làm việc là thư mục app.
- **Migration bằng pre-deploy command** (`pnpm --filter @credflow/api db:migrate`), timeout 300 s. Lỗi thì lần deploy dừng, bản cũ chạy tiếp.
- **Healthcheck `/ready`**: Railway chỉ chuyển traffic khi bản mới kết nối được Postgres và Redis.
- **Watch Paths theo từng service** (code của app, package workspace nó import, file cài đặt chung, file app đọc lúc chạy như `config/rules`). **Wait for CI**: chỉ deploy khi GitHub Actions xanh.
- **File upload trên Railway Bucket** (tương thích S3) qua `S3Storage` (plan 33), chọn bằng `STORAGE_DRIVER=s3`; biến bucket gắn bằng reference variable `${{Bucket.…}}`. Máy dev giữ `LocalStorage`.
- **Biến môi trường** đặt trên từng service, giá trị dùng chung lấy bằng reference variable (`${{Postgres.DATABASE_URL}}`, `${{Redis.REDIS_URL}}?family=0`). Không có secret trong repo.
- **Chi phí:** Trial ($5 dùng một lần) khi học; chạy thật thì lên Hobby và đặt Usage Limits (soft khoảng $10, hard khoảng $20).

## Phương án đã loại

- **VPS DigitalOcean + docker compose:** học quản lý server nhưng phải tự vận hành (vá, backup, HTTPS); Liam ưu tiên ít phức tạp.
- **Vercel + Railway + Supabase:** ba nhà cung cấp, cookie khác domain phải sửa ADR 0004, gói free Supabase tự dừng khi không dùng.
- **Serverless thuần:** phải bỏ BullMQ, viết lại phần lõi.
- **Cloudflare R2:** cùng giá với Railway Bucket nhưng thêm một tài khoản, key phải dán tay.
- **Volume cho file:** volume chỉ gắn một service, `worker` không đọc được file của `api`.

## Hệ quả

- Phụ thuộc Railway; đổi nền tảng thì cấu hình build/start/biến phải làm lại (Bài 10: đưa cấu hình vào `.railway/railway.ts`).
- Bucket Railway chỉ có địa chỉ công khai: upload từ `api` tính egress service (nhỏ ở quy mô demo).
- Lệch phiên bản giữa dev và Railway cần xử lý riêng: Postgres dev 16 / Railway 18.6; Node dev 24 / Railpack 22.

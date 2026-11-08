# Checklist kỹ thuật: dựng một web app fullstack Node

Rút ra từ CredFlow (2026-11-08). Tick = Liam đã tự tay làm. Chưa tick = chưa làm, hoặc Claude Code làm (Liam mới duyệt, chưa tự làm), nên vẫn cần tự luyện. File tham chiếu nằm trong ngoặc.

## Checklist

- [ ] Monorepo pnpm, TypeScript strict, không `any` (`pnpm-workspace.yaml`)
- [ ] Contract Zod dùng chung web và api, parse ở mọi ranh giới I/O (`packages/contracts`)
- [ ] API NestJS: module, DI, controller, guard, filter lỗi (`apps/api/src`)
- [ ] Kiểm biến môi trường lúc khởi động, sai thì dừng và nêu tên biến (`config/env.schema.ts`)
- [ ] Schema DB, migration, constraint (CHECK, FK, unique) bằng Drizzle (`db/schema.ts`, `drizzle/`)
- [ ] Đăng nhập email + mật khẩu: hash scrypt, session trong DB, cookie `httpOnly` (`auth/`)
- [ ] Phân quyền theo vai trò (`@Roles`, guard toàn cục)
- [ ] Đăng nhập Google OAuth: state, PKCE, kiểm id_token (`auth/google/`)
- [ ] Upload file stream, lưu S3 (`storage/`)
- [ ] Hàng đợi BullMQ + worker tách process, retry, job định kỳ (`worker/`, `queue/`)
- [ ] Rate limit, trần dùng mỗi ngày, xoá file cũ (`rate-limit/`, plan 34)
- [ ] Mã hoá bí mật lưu trong DB bằng AES-256-GCM (`settings/secret-box.ts`)
- [ ] Gọi LLM, parse output bằng schema, eval đo chất lượng (`llm/`, `eval/`)
- [ ] Frontend Next.js + Tailwind + shadcn/ui + TanStack Query (`apps/web`)
- [ ] Unit test, integration test với DB thật, test đỏ trước khi sửa (`apps/api/test`)
- [ ] CI GitHub Actions: lint, typecheck, test, chặn merge khi đỏ (`.github/workflows/ci.yml`)
- [x] Tạo project và service trên Railway, nối GitHub repo
- [x] Cấu hình build, start, pre-deploy (migration), healthcheck `/ready`
- [x] Watch paths theo service, Wait for CI
- [x] Mạng nội bộ: chỉ `web` công khai, `api` qua `*.railway.internal`
- [x] Biến môi trường, reference variable, shared variable
- [x] Postgres, Redis, Bucket managed trên Railway
- [x] `railway` CLI: link, ssh, seed dữ liệu trên production
- [x] Xử lý lộ bí mật: đổi mật khẩu DB, sinh lại mật khẩu seed
- [x] Đọc log deploy, phân biệt Redeploy với Deploy Latest Commit (`docs/deploy.md`)
- [x] Duyệt plan, đọc evidence, merge PR
- [ ] Tự viết plan, ADR, evidence cho một tính năng
- [ ] Tạo OAuth client Google, bật đăng nhập Google trên production
- [ ] Domain riêng + HTTPS
- [ ] Email giao dịch (đặt lại mật khẩu, thông báo)
- [ ] Backup Postgres và thử khôi phục
- [ ] Lên Hobby, đặt Usage Limit; đặt trần chi tiêu Anthropic
- [ ] Log có cấu trúc, uptime check, báo lỗi, cảnh báo khi deploy hỏng

## Đủ cho business nhỏ chưa?

Đủ nếu chỉ một công ty dùng (single-tenant), vài chục người, vài trăm giấy mỗi ngày: một `api`, một `worker`, một Postgres, một Redis gánh được, `worker` tăng replica khi chậm. Trước khi nhận khách thật cần:

- [ ] Backup DB và thử khôi phục thật một lần
- [ ] Giám sát và cảnh báo (lỗi, hàng đợi ứ, deploy hỏng)
- [ ] Lên Hobby, đặt Usage Limit; trần chi tiêu Anthropic
- [ ] Domain riêng và email
- [ ] Bật đăng nhập Google trên production (code xong ở plan 36, còn OAuth client và 4 biến)
- [ ] Trang chính sách quyền riêng tư (Google yêu cầu khi publish app OAuth; app nhận giấy tờ cá nhân)
- [ ] Multi-tenant (cột `tenant_id`, cách ly dữ liệu) chỉ khi có khách thứ hai

Đã có: tài liệu vận hành `docs/deploy.md`, deploy không downtime (healthcheck), migration tự chạy, rate limit và trần chi phí, bí mật không nằm trong repo.

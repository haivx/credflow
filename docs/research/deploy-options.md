# Phương án deploy CredFlow (P6a)

> Viết 2026-11-07 cho Liam nghiên cứu. **Đã chốt cùng ngày: Railway (phương án A), file trên Railway Bucket thay R2. Xem ADR 0013.** Trong ngày từng chọn VPS DigitalOcean (phương án D) rồi đổi vì Liam ưu tiên ít vận hành. Phần dưới giữ nguyên để biết vì sao chọn.
> **Giá trong file này chủ yếu lấy từ trang tổng hợp của bên thứ ba, có chỗ mâu thuẫn nhau.** Mọi con số phải kiểm lại trên trang giá chính thức trước khi chốt (danh sách ở mục 6).

## 1. CredFlow cần gì khi chạy thật

| Thành phần | Hiện ở máy dev | Khi deploy cần |
| --- | --- | --- |
| API (NestJS, `dist/main.js`) | `make dev-api`, cổng 8787 | 1 process HTTP, có healthcheck `/ready` |
| Worker (BullMQ, `dist/worker.js`) | `make dev-worker`, không mở cổng | 1 process chạy nền, **không** cần cổng; tắt êm (chờ job đang chạy) khi deploy lại |
| Web (Next 14) | `next dev`, gọi API qua rewrite `/api/*` → `API_URL` | 1 process Node (`next start`) hoặc host tĩnh + serverless; rewrite giữ cookie cùng site (ADR 0004) |
| Postgres 16 | docker compose | Có backup; chạy migration (`drizzle-kit migrate`) **trước** khi app mới nhận traffic |
| Redis 7 | docker compose, `maxmemory-policy noeviction` | **Bắt buộc `noeviction`** (BullMQ mất job nếu Redis tự xoá key, ADR 0001). Không cần AOF |
| File upload | `LocalStorage` ghi `DATA_DIR` trên đĩa | API ghi, **worker đọc** cùng file → hai process phải dùng chung ổ đĩa, **hoặc** chuyển sang storage S3 (cần viết adapter `S3Storage` theo interface `apps/api/src/storage/storage.ts`) |
| Secret và cấu hình | `.env` | `ANTHROPIC_API_KEY`, `DATABASE_URL`, `REDIS_URL` đặt trong secret của nền tảng, không nằm trong image hay repo. `COOKIE_SECURE=true` khi chạy HTTPS. Mật khẩu user seed (`credflow-dev`, `apps/api/scripts/seed-data.ts`) phải đổi qua env khi deploy |

Việc phải làm **dù chọn nền tảng nào** (phạm vi P6a trong roadmap):
1. Dockerfile multi-stage cho API/worker (một image, hai lệnh chạy) và cho web (Next `output: "standalone"`).
2. Bước migration lúc deploy (release command / job chạy trước).
3. Graceful shutdown: `app.enableShutdownHooks()`, `worker.close()` chờ job xong. Kiểm: deploy lại khi có job đang chạy mà không mất job.
4. Chặn rủi ro demo công khai: chỉ tài khoản demo seed sẵn (không tự đăng ký), rate limit upload, trần chi tiêu Anthropic trong Console, cờ tắt LLM, tự xoá file sau N giờ, banner "chỉ dùng giấy giả lập" (`docs/data-policy.md`).
5. Domain + HTTPS; backup Postgres; xem log của cả 3 process ở một chỗ.

## 2. Năm phương án

### A. Railway: tất cả trên một nền tảng
- **Cách dựng:** 3 service từ cùng repo (api, worker, web) build bằng Dockerfile; Postgres và Redis là service có sẵn trong project; mạng nội bộ giữa các service.
- **File:** volume của Railway gắn vào **một** service, nên API và worker không dùng chung được → cần `S3Storage` + Cloudflare R2 (hoặc storage S3 của Railway nếu có, cần kiểm).
- **Redis `noeviction`:** Redis của Railway là container chạy image Redis; đổi policy bằng lệnh khởi động/biến cấu hình (có thảo luận trên Railway Station). **Cần kiểm.**
- **Giá (bên thứ ba, cần kiểm):** gói Hobby $5/tháng có kèm $5 usage, vượt thì tính theo phút CPU/RAM; volume khoảng $0.25/GB/tháng. Ước tính cho Node + Postgres + Redis + worker dao động **$15–60/tháng** tuỳ nguồn. Hobby hết hạn mức thì service bị tạm dừng.
- **Hợp:** ít việc vận hành nhất; deploy theo push GitHub; log và biến môi trường gom một chỗ.
- **Không hợp:** chi phí theo usage khó đoán (worker chạy liên tục, Postgres/Redis luôn bật); bị khoá vào nền tảng.

### B. Render: tất cả trên một nền tảng
- **Cách dựng:** web service (API), background worker, web service (Next), Postgres, Key Value (Redis/Valkey) trong một Blueprint (`render.yaml`).
- **File:** persistent disk chỉ gắn vào một service, và service có disk không scale nhiều instance được → vẫn cần `S3Storage` + R2.
- **Redis `noeviction`:** Key Value có cấu hình chính sách eviction trên dashboard (theo tài liệu Render), bản free không lưu xuống đĩa. **Cần kiểm** có chọn được `noeviction`.
- **Giá (bên thứ ba, cần kiểm):** worker nhỏ nhất khoảng $7/tháng; disk $0.25/GB; free web service ngủ sau 15 phút không có truy cập (không hợp cho API vì worker vẫn cần chạy). Tổng ước khoảng **$25–45/tháng** cho API + worker + web + Postgres + Key Value trả phí.
- **Hợp:** giá theo gói cố định, dễ dự đoán hơn Railway; Blueprint là "infra as code" đơn giản.
- **Không hợp:** đắt hơn VPS; vẫn cần S3.

### C. Fly.io: máy nhỏ chạy Docker
- **Cách dựng:** 3 app hoặc 1 app nhiều process group (api, worker, web) trên Machines; Managed Postgres (gói riêng) hoặc tự chạy Postgres; Redis qua Upstash (bên thứ ba) hoặc tự chạy Redis trên một Machine có volume; file qua Tigris (S3, tích hợp sẵn).
- **Redis:** Upstash tính theo số lệnh, mà BullMQ gọi Redis liên tục cả khi rảnh. Chính tài liệu Upstash khuyên dùng gói Fixed cho BullMQ (khoảng $10–20/tháng). Phải kiểm `CONFIG GET maxmemory-policy`. Tự chạy Redis trên Machine thì rẻ hơn nhưng tự lo.
- **Giá (bên thứ ba, cần kiểm):** máy shared-CPU nhỏ nhất luôn bật khoảng $2–5/tháng mỗi máy; Managed Postgres tính theo gói + $0.28/GB; từ 2/2026 tính tiền lưu lượng giữa các region.
- **Hợp:** rẻ nếu tự chạy Redis; gần với Docker thật; Tigris có sẵn.
- **Không hợp:** nhiều cấu hình nhất (fly.toml, process group, volume, Postgres); nhiều thứ "tự lo" hơn Railway/Render.

### D. Một VPS + docker compose
- **Cách dựng:** một máy (Hetzner CX23 khoảng €4–6/tháng sau các đợt tăng giá 2026, hoặc DigitalOcean/Vultr khoảng $6–12) chạy chính `docker-compose.yml` mở rộng: api, worker, web, postgres, redis (`noeviction` như máy dev), Caddy làm reverse proxy + HTTPS tự động. Deploy bằng GitHub Actions: build image → push GHCR → SSH `docker compose pull && up -d`. Có thể thay bằng Coolify/Dokploy (giao diện PaaS tự host) hoặc Kamal (deploy từ máy/CI, zero-downtime).
- **File:** volume Docker dùng chung giữa API và worker → **không cần S3**, giữ `LocalStorage`.
- **Giá:** rẻ nhất và cố định: **khoảng €5–12/tháng** tất cả, cộng domain.
- **Hợp:** gần máy dev nhất (cùng compose); học Docker, reverse proxy, CI deploy; không phải viết `S3Storage` ngay.
- **Không hợp:** Liam tự lo server: cập nhật bảo mật, firewall, backup Postgres (cron `pg_dump` → R2), giám sát ổ đĩa, khôi phục khi máy hỏng. Một máy = một điểm hỏng.

### E. Lai: Vercel (web) + nền tảng khác (API, worker)
- **Cách dựng:** Next trên Vercel (miễn phí cho dự án cá nhân, cần kiểm điều khoản), API + worker trên Railway/Render/Fly/VPS, Postgres trên Neon/Supabase, Redis trên nền tảng của API.
- **Hợp:** web nhanh, preview cho mỗi PR.
- **Không hợp:** nhiều nhà cung cấp, nhiều nơi đặt secret; rewrite `/api/*` từ Vercel sang API ở domain khác cần kiểm cookie session (ADR 0004) và CORS. Lợi ích không đáng so với độ phức tạp ở quy mô demo.

## 3. So sánh nhanh

| | A. Railway | B. Render | C. Fly.io | D. VPS + compose | E. Lai |
| --- | --- | --- | --- | --- | --- |
| Chi phí/tháng (ước, cần kiểm) | $15–60, theo usage | $25–45, theo gói | $10–30 | **€5–12, cố định** | tuỳ ghép |
| Công dựng ban đầu | **thấp** | thấp | cao | trung bình | cao |
| Vận hành hằng tháng | **gần như không** | gần như không | ít | **Liam tự lo** | ít, nhưng nhiều nơi |
| Cần `S3Storage` + R2 | có | có | có (Tigris) | **không** | có |
| `noeviction` | cần kiểm | cần kiểm | tự chạy: chắc; Upstash: cần kiểm | **chắc chắn** (như dev) | tuỳ |
| Deploy lại không mất job | được (cần graceful shutdown) | được | được | được (cần cấu hình thứ tự tắt) | được |
| Giá trị học (mức middle) | Dockerfile, env, release | Blueprint, env | Docker, mạng nội bộ | **Docker, reverse proxy, CI/CD, server** | ít thêm |
| Rủi ro chính | hoá đơn khó đoán | đắt hơn | cấu hình nhiều | sự cố server | rời rạc |

## 4. Gợi ý của Claude (Liam chốt)

- **Muốn ít việc nhất, có link nhanh:** **A. Railway** + R2. Phải viết `S3Storage` (việc tốt cho P6 vì roadmap đã định "local trước, S3 sau"). Đặt giới hạn chi tiêu trên Railway nếu có.
- **Muốn rẻ, cố định, học nhiều về vận hành:** **D. VPS + compose + Caddy**, deploy bằng GitHub Actions. Giữ `LocalStorage`; backup `pg_dump` lên R2.
- Không khuyến nghị E ở quy mô demo; C chỉ đáng nếu Liam muốn học Fly cụ thể.

## 5. Câu hỏi Liam cần trả lời để chốt

1. Ngân sách tối đa mỗi tháng cho demo (chưa tính tiền Claude)?
2. Liam có muốn tự quản lý một server Linux (cập nhật, firewall, backup) không?
3. Link demo: công khai với tài khoản demo, hay chỉ người được mời?
4. Có domain riêng chưa?
5. Demo cần chạy liên tục, hay được phép "ngủ" khi không ai dùng (rẻ hơn, nhưng worker phải thức khi có job)?
6. Dữ liệu demo giữ bao lâu (gợi ý: xoá file sau 24–72 giờ)?

## 6. Việc cần kiểm trên trang chính thức

- Railway: giá Hobby/Pro hiện tại, giới hạn chi tiêu, cách đặt `maxmemory-policy` cho Redis, volume dùng chung được không.
- Render: giá background worker, Key Value có chọn `noeviction` không, giá Postgres nhỏ nhất.
- Fly.io: giá Machines, Managed Postgres, Tigris; Upstash Fixed và policy eviction.
- Hetzner: gói CX23 (CX22 có thể đã ngừng bán), giá sau đợt tăng 2026, vị trí datacenter.
- Cloudflare R2: free tier (10 GB, 1M thao tác ghi, 10M thao tác đọc mỗi tháng, egress miễn phí); có tương thích S3 SDK.
- Anthropic Console: cách đặt spend limit cho API key.

## Nguồn (đọc 2026-11-07, chủ yếu bên thứ ba)

- Railway: [servercompass.app](https://servercompass.app/blog/railway-pricing-what-youll-actually-pay), [dev.to review](https://dev.to/build996/railway-app-review-2026-the-best-heroku-alternative-for-developers-1j8o), [costbench Railway Postgres](https://www.costbench.com/software/database-as-service/railway-postgres/hidden-costs/), [Railway Station: đổi policy Redis](https://station.railway.com/questions/changing-a-policy-on-redis-instance-12d9a9f6)
- Render: [temps.sh](https://temps.sh/blog/render-pricing-2026), [activepieces](https://www.activepieces.com/blog/render-pricing-2026-free-tier-workers-total-cost.md), [Render changelog Key Value](https://render.com/changelog/added-two-key-value-plans-and-lowered-prices-for-larger-existing-plans), [livemy.app](https://livemy.app/blog/render-pricing)
- Fly.io: [fly.io/pricing](https://fly.io/pricing.md), [temps.sh](https://temps.sh/blog/fly-io-pricing-2026), [sota.io so sánh giá](https://sota.io/blog/railway-vs-render-vs-fly-pricing-2026), [northflank Railway vs Fly](https://northflank.com/blog/railway-vs-flyio)
- Hetzner và công cụ tự host: [cpc-2026-08](https://kimmo.suominen.com/stuff/cpc-2026-08.txt), [vpsbenchmarks CX22](https://vpsbenchmarks.com/hosters/hetzner/plans/cx22), [coolify so sánh](https://coolify.io/compare/coolify-vs-dokploy-vs-caprover-vs-dokku-vs-kamal), [bitdoze Coolify vs Dokploy vs Kamal](https://www.bitdoze.com/coolify-vs-dokploy-vs-kamal-2/)
- BullMQ + Redis: [BullMQ going to production](https://docs.bullmq.io/guide/going-to-production), [Upstash BullMQ](https://upstash.com/docs/redis/integrations/bullmq), [Upstash billing](https://upstash.com/docs/redis/overall/billing)
- Cloudflare R2: [developers.cloudflare.com](https://developers.cloudflare.com/r2/pricing/index.md), [filebase](https://filebase.com/blog/cloudflare-r2-pricing-costs-savings-and-alternatives-in-2026/)

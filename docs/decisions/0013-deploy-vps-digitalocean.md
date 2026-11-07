# 0013 · Deploy demo lên một VPS DigitalOcean bằng docker compose

Trạng thái: Đã chốt · Ngày: 2026-11-07 · Nghiên cứu: `docs/research/deploy-options.md`

## Bối cảnh

Liam muốn deploy sớm (P6a, trước P5) và muốn tự học quản lý server ở mức middle; deploy lên PaaS kiểu Vercel đã làm rồi. VPS này còn dùng tiếp cho 2–3 app học khác sau CredFlow. Chạy thử 1 tháng rồi tính tiếp.

## Quyết định (Liam chốt 2026-11-07)

- **Server:** một droplet DigitalOcean Basic, region **Singapore** (gần Việt Nam), bắt đầu **4 GB / 2 vCPU** (khoảng $24/tháng, kiểm lại giá lúc tạo). Thêm app thì nâng lên 8 GB, chọn kiểu nâng **chỉ CPU/RAM** (hạ lại được). Không bật backup của DigitalOcean.
- **Chạy app:** docker compose trên droplet: `api`, `worker` (cùng một image, khác lệnh), `web` (Next standalone), `postgres`, `redis` (`noeviction`, như máy dev), `caddy` (reverse proxy + HTTPS tự động). Cấu hình ở `compose.prod.yml` trong repo.
- **File upload:** giữ `LocalStorage` trên volume Docker dùng chung cho `api` và `worker`. Chưa viết adapter S3 (lệch `docs/product.md`, đã sửa ở đó).
- **Domain, DNS, backup:** domain mua và quản lý DNS ở Cloudflare; backup Postgres bằng `pg_dump` theo lịch lên Cloudflare R2, có thử khôi phục.
- **Deploy:** GitHub Actions build image → GitHub Container Registry → SSH vào droplet `docker compose pull && up -d`; migration chạy trước khi app mới nhận traffic; rollback bằng tag image cũ.
- **Học tay:** Liam tự dựng server theo runbook (`docs/ops/runbook.md`): SSH key, user không phải root, `ufw`, cập nhật tự động, cài Docker.
- **Nhiều app sau này:** dùng chung Postgres (mỗi app database + user riêng) và Caddy (mỗi app một subdomain). Redis `noeviction` áp cho mọi app; app cần cache tự xoá key thì chạy Redis riêng.

## Phương án đã loại

- **Railway / Render / Fly.io:** ít việc vận hành nhưng không học được quản lý server; cần adapter S3 vì API và worker không dùng chung ổ đĩa; thêm app là thêm tiền nền tảng.
- **Hetzner CX33:** rẻ hơn khoảng 5 lần, nhưng dòng giá rẻ có lúc không đặt được (2026), server ở EU xa Việt Nam, đăng ký có thể bị kiểm tra danh tính chặt.
- **Vultr:** ngang giá DigitalOcean, tài liệu hướng dẫn kém hơn.
- **Coolify / Dokploy / Kamal:** giấu đúng phần Liam muốn học.

## Hệ quả

- Một máy là một điểm hỏng: máy chết thì demo chết tới khi dựng lại từ runbook + backup. Chấp nhận cho demo.
- Liam chịu trách nhiệm vá bảo mật và theo dõi ổ đĩa; runbook ghi việc định kỳ.
- Đổi sang S3 khi cần nhiều máy hoặc khi chuyển lên PaaS; interface `Storage` đã sẵn.
- Học nâng cao (để sau): Ansible/Terraform, nhiều server, Prometheus/Grafana, blue-green, Postgres PITR, hardening theo CIS.

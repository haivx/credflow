# 09 · Kiểm máy sạch + CI, đóng P0

Phase: P0 · Trạng thái: Đã duyệt · Ngày: 2026-11-03

## Context

P0 còn một tiêu chí: `make setup && make dev` chạy trên máy sạch. Đọc repo thấy vài chỗ có thể vỡ khi làm theo README từng chữ:

- `make setup` không chạy migration và seed → DB trống, `GET /staff` lỗi vì chưa có bảng.
- `make db-up` dùng `docker compose up -d` không `--wait`, service `db` không có healthcheck → lệnh migrate ngay sau có thể chạy khi Postgres chưa nhận kết nối.
- README ghi "bật Postgres" (thực ra cả Redis), mô tả `make dev` thiếu worker; mục "Trạng thái" vẫn ghi skeleton.

Quyết định đã chốt (Liam, 2026-11-03):
1. `make setup` tự chạy migrate + seed (seed idempotent, chạy lại an toàn).
2. Thêm CI GitHub Actions ngay trong plan này.
3. Không có mục "Liam tự viết": plan không có 🎓 mới (🎓 của P0 đã làm hết), Claude làm toàn bộ.

Đã kiểm docs (Context7, 2026-11-03):
- `pnpm/action-setup@v6`: bỏ trống `version` thì đọc `packageManager` trong `package.json` (`pnpm@11.9.0`); có `cache: true` để cache pnpm store. Không được đặt `version` khác `packageManager` (action báo lỗi).
- `actions/checkout@v6`, `actions/setup-node@v6`.

## Phạm vi

- Trong: healthcheck cho `db`; `make setup` chờ DB rồi migrate + seed; kiểm máy sạch bằng clone mới; sửa mọi chỗ vấp; workflow CI (lint, typecheck, test, test-int); cập nhật README, CLAUDE.md, STATUS, roadmap; sửa comment "chốt ở P0" trong contract `extraction`/`rules` cho khớp `product.md` (chốt ở P1).
- Ngoài: build Docker image, deploy (P6); chạy `make eval` trong CI (P2); branch protection bắt buộc CI xanh mới merge (Liam bật tay trên GitHub nếu muốn, ghi ở Rủi ro); build `apps/web` trong CI (chỉ typecheck).

## Thay đổi

| File | Thay đổi |
| --- | --- |
| `docker-compose.yml` | Thêm healthcheck `pg_isready -U credflow -d credflow` cho `db` (giống `db-test`). |
| `Makefile` | `db-up`: `docker compose up -d --wait db redis`. `setup`: `pnpm install --frozen-lockfile` → `db-up` → `db-migrate` → `db-seed`. Comment ghi rõ chạy lại an toàn. |
| `.github/workflows/ci.yml` | Chạy khi `push` lên `main` và mọi `pull_request`. Một job `ubuntu-latest`: checkout → `pnpm/action-setup@v6` (`cache: true`) → `setup-node@v6` (Node 22) → `pnpm install --frozen-lockfile` → `make build-packages` → `make lint` → `make typecheck` → `make test` → `make test-int` (dùng docker compose có sẵn trên runner, cùng đường với máy dev). `concurrency` huỷ run cũ của cùng nhánh. Không cần `.env`: integration test tự đặt env (`test/test-env.ts`). |
| `README.md` | Mục "Bắt đầu": yêu cầu, 3 bước (`cp .env.example .env`, `make setup`, `make dev`), bảng URL kiểm nhanh (`/health`, `/ready`, `/staff`, web :3000), `make test` / `make test-int`. Bỏ dòng "Trạng thái: skeleton". Badge CI. |
| `CLAUDE.md` | Mục Lệnh: `make setup` giờ có migrate + seed; nhắc CI chạy gì. |
| `packages/contracts/src/extraction.ts`, `rules.ts` | Chỉ sửa comment: "Liam chốt ở P1". Không đổi schema. |
| `docs/roadmap.md`, `docs/STATUS.md` | Đánh dấu P0 xong (nếu đủ tiêu chí), plan 08 đã merge (PR #7), phase hiện tại P1. |
| (tuỳ phát hiện) | Chỗ vấp khác tìm thấy khi kiểm máy sạch: ghi vào mục "Kết quả kiểm" bên dưới rồi sửa. |

## Cách kiểm máy sạch

"Máy sạch" mô phỏng trên máy hiện tại, không đụng repo và DB dev:

1. Không xoá volume của repo dev. Thay vào đó `git clone` từ GitHub vào thư mục tạm trong scratchpad (không có `node_modules`, `dist/`, `.env`), đặt `COMPOSE_PROJECT_NAME` khác để volume `pgdata` mới hoàn toàn.
2. Cổng 5432/6379/8787/3000 trùng với stack dev → tắt stack dev trước (`make db-down`, giữ volume), kiểm xong bật lại.
3. Làm đúng theo README, không thêm lệnh nào ngoài README. Vấp chỗ nào ghi lại chỗ đó.
4. Smoke check bằng `curl`: `/health` 200, `/ready` 200, `GET /staff` trả 10 staff seed; log worker có dòng khởi động; `curl localhost:3000` trả 200.
5. Chạy `make setup` lần hai: không lỗi, seed báo `inserted 0`.
6. Dọn: `docker compose down -v` với project tạm, xoá thư mục clone.

CI là lần kiểm máy sạch thứ hai, và tự lặp lại ở mọi PR sau.

## Contract / config / prompt bị ảnh hưởng

- Không đổi schema contract, rule, prompt, model, schema DB. Chỉ sửa comment ở 2 file contract.
- Không thêm dependency npm. Thêm GitHub Actions (`actions/checkout`, `pnpm/action-setup`, `actions/setup-node`).

## Test và cách kiểm tra

- Kiểm máy sạch theo mục trên.
- `make lint`, `make typecheck`, `make test`, `make test-int` pass ở máy dev.
- CI xanh trên PR của plan này (cả 4 bước). Thử một commit cố ý làm hỏng test trên nhánh tạm → CI đỏ (rồi xoá nhánh).
- Eval: không cần.

## Tiêu chí xong

- [ ] Clone mới + làm đúng README (`cp .env.example .env`, `make setup`, `make dev`) chạy được, smoke check đủ 5 điểm.
- [ ] `make setup` chạy lại lần hai không lỗi, không sinh dữ liệu trùng.
- [ ] CI chạy lint, typecheck, test, test-int; xanh trên PR này; đỏ khi test hỏng.
- [ ] README, `CLAUDE.md` (mục Lệnh) cập nhật; comment contract khớp `product.md`.
- [ ] Đủ mọi tiêu chí P0 → roadmap và STATUS ghi P0 xong, phase hiện tại P1.

## Kết quả kiểm

(điền khi làm)

## Rủi ro / câu hỏi

1. Repo private: GitHub Free có 2.000 phút Actions/tháng cho repo private. Một run ước ~3–5 phút, đủ dùng; `concurrency` huỷ run cũ để đỡ tốn.
2. `make test-int` trên runner kéo image `postgres:16`, `redis:7` mỗi lần (~20–30s). Chấp nhận; không dùng `services:` của Actions để CI đi cùng đường `docker compose` với máy dev.
3. Branch protection (bắt CI xanh mới merge): cài trên GitHub Settings, ngoài repo. Liam quyết có bật không sau khi CI chạy ổn.
4. Nếu kiểm máy sạch thấy vấn đề lớn hơn dự kiến (vd typed lint cần `dist/` trước), sửa trong plan này nếu nhỏ; lớn thì dừng lại hỏi.
5. Không cần ADR: CI không đổi stack hay kiến trúc; lý do ghi trong plan.

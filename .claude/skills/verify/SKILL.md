---
name: verify
description: Chạy app thật và chứng minh một thay đổi chạy đúng từ đầu tới cuối. Dùng sau mọi thay đổi hành vi, trước khi khẳng định đã sửa bug, khi tái hiện một báo lỗi, hoặc khi Liam hỏi "chạy được chưa?". Tạo ra evidence report.
---

# Verify

Đọc `docs/agent/VERIFICATION.md` một lần mỗi phiên nếu chưa đọc. Skill này là cách
thực hiện các rule trong đó.

> **Trạng thái:** các script trong `scripts/` (`up.sh`, `seed.ts`, `api.sh`, `ui.ts`, `fixtures.ts`)
> **chưa có**, sẽ làm ở Phase 1 bước 4 sau khi Liam duyệt. Trong lúc chờ, dùng lệnh thay thế
> ghi ở từng bước dưới đây và ghi rõ trong report là đã dùng lệnh thay thế.

## Cần có trước khi bắt đầu

- Cái gì đã thay đổi (hoặc bug nào được báo).
- Hành vi kỳ vọng, theo cách người dùng nói.
- Các mục liên quan trong `FEATURE_MAP.md` (cùng thư mục này).

Tính năng chưa có trong FEATURE_MAP.md thì thêm vào như một phần của task (xem "Bảo trì").

## Quy trình

### 1. Bật app
```bash
.claude/skills/verify/scripts/up.sh
```
- Thoát với mã khác 0 nếu app không khoẻ trong thời gian chờ. Lỗi thì đọc
  `.verify/logs/` và sửa môi trường trước. Không lách qua một lần khởi động hỏng.
- Không bao giờ bật app bằng lệnh tuỳ hứng; luôn đi qua `up.sh` để mọi lần
  kiểm chứng chạy y hệt nhau.
- **Thay thế khi chưa có script:** `make setup` (Postgres, Redis, migrate, seed) rồi
  `make build-packages && pnpm --filter @credflow/api build && node apps/api/dist/main.js`
  (chạy nền), chờ `curl -sf http://127.0.0.1:8787/ready`. Dừng process khi xong.

### 2. Seed dữ liệu (nếu kịch bản cần)
```bash
pnpm tsx .claude/skills/verify/scripts/seed.ts --scenario <name>
```
Danh sách kịch bản nằm trong `scripts/seed.ts`. Fixture chỉ là dữ liệu giả lập, có watermark SAMPLE.
- **Thay thế khi chưa có script:** `make db-seed` (10 staff + 3 user, xem FEATURE_MAP.md).
- Dữ liệu tạo thêm khi kiểm tay trên DB dev (document, file trong `data/files/`) phải dọn lại sau khi kiểm.

### 3. Chọn mức
Chọn mức rẻ nhất chứng minh được thay đổi (VERIFICATION.md, Rule 3).
Backend/pipeline → API trước (`make test-int` + gọi API đang chạy). Người dùng thấy được → kiểm thêm UI.

### 4. Điều khiển và quan sát

**API (L2):**
```bash
.claude/skills/verify/scripts/api.sh GET  /health
.claude/skills/verify/scripts/api.sh POST /documents @<fixture>.pdf
```
Output là JSON gọn: status, thời gian, body đã cắt gọn.
- **Thay thế khi chưa có script:** đăng nhập lấy cookie rồi gọi bằng curl:
  ```bash
  curl -s -c .verify/jar -H 'content-type: application/json' \
    -d '{"email":"staff@example.test","password":"credflow-dev"}' http://127.0.0.1:8787/auth/login
  curl -s -w ' [%{http_code} %{time_total}s]\n' -b .verify/jar -F file=@<fixture>.pdf http://127.0.0.1:8787/documents
  ```
- Kiểm thêm trạng thái DB khi cần:
  `docker compose exec -T db psql -U credflow -d credflow -c "SELECT id, status FROM documents ORDER BY created_at DESC LIMIT 5"`.

**UI (L3):** (`apps/web` chưa có màn nào)
```bash
pnpm tsx .claude/skills/verify/scripts/ui.ts --path /<duong-dan> --shot .verify/shots/<name>.png
```
Output: HTTP status, tiêu đề trang, lỗi console, request mạng lỗi, đường dẫn screenshot.
Mở screenshot bằng tool Read và nhìn thật sự.

**Bước pipeline / LLM:** (từ P2)
```bash
make eval
```
Chạy bộ golden fixture; báo qua/không qua cho từng fixture so với các trường chính kỳ vọng,
và `falseApproveRate` so với lần trước (mục tiêu 0).

### 5. Đánh giá
- So cái quan sát được với cái kỳ vọng, theo cách người dùng nói.
- Với bug: phải có một lần chạy **đỏ** (trước khi sửa) và một lần chạy **xanh** (sau khi sửa)
  của cùng bước tái hiện.
- Lỗi console hay request lỗi trong một lần kiểm UI "đã qua" thì tính là không qua cho tới
  khi giải thích được.
- Bất kỳ đường nào cho document thành `auto_approved` khi có rule `block` không qua, hoặc
  thành `rejected` mà không có người duyệt, là không qua dù mọi thứ khác xanh.

### 6. Báo cáo
Viết evidence report theo `docs/agent/templates/EVIDENCE_REPORT.md`.
Lưu ở `.verify/reports/<yyyy-mm-dd>-<ten-task-ngan>.md` và dán mục tóm tắt
vào tin nhắn cuối và mô tả PR.

## Rule cứng
- Không nói xong/đã sửa/chạy được khi chưa có report.
- Không sửa script trong skill này để một check qua. Script sai thì sửa nó
  ở một bước riêng, ghi rõ nhãn, và nói ra.
- Không bỏ qua mức kiểm mà plan đã duyệt hứa. Nếu hoá ra không làm được thì
  báo CHƯA KIỂM kèm lý do.
- Không có dữ liệu cá nhân hay y tế thật ở bất cứ đâu: fixture, log, screenshot, prompt.

## Bảo trì skill này
- Tính năng hoặc route mới → thêm/cập nhật mục của nó trong FEATURE_MAP.md trong cùng thay đổi.
- Kiểu kiểm mới mà phải ứng biến → biến nó thành script ở đây thay vì
  lần sau lại ứng biến.
- Liam phải chỉnh lại cách bạn kiểm chứng một thứ (kiểm thiếu, kiểm sai mức, kết luận không có bằng chứng)
  → ghi vào bảng **Watchlist** trong `docs/agent/GUARDRAILS.md`.

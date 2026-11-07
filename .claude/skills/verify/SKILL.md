---
name: verify
description: Chạy app thật và chứng minh một thay đổi chạy đúng từ đầu tới cuối. Dùng sau mọi thay đổi hành vi, trước khi khẳng định đã sửa bug, khi tái hiện một báo lỗi, hoặc khi Liam hỏi "chạy được chưa?". Tạo ra evidence report.
---

# Verify

Đọc `docs/agent/VERIFICATION.md` một lần mỗi phiên nếu chưa đọc. Skill này là cách
thực hiện các rule trong đó.

Script trong `scripts/` (plan 20): `up.sh`, `down.sh`, `api.sh`, `ui.mts`. Mỗi lần kiểm chứng đi
qua các script này, không dựng lệnh tay; thiếu thứ gì thì thêm vào script (xem "Bảo trì").

## Cần có trước khi bắt đầu

- Cái gì đã thay đổi (hoặc bug nào được báo).
- Hành vi kỳ vọng, theo cách người dùng nói.
- Các mục liên quan trong `FEATURE_MAP.md` (cùng thư mục này).

Tính năng chưa có trong FEATURE_MAP.md thì thêm vào như một phần của task (xem "Bảo trì").

## Quy trình

### 1. Bật app
```bash
.claude/skills/verify/scripts/up.sh          # API + worker
.claude/skills/verify/scripts/up.sh --web    # thêm web localhost:3000 (kiểm UI)
```
- Bật Postgres, Redis, chạy migrate + seed (13 staff + 6 user, xem FEATURE_MAP.md), rồi API, worker
  (+ web) chạy nền. Log ở `.verify/logs/`. Chờ `/ready` và log "worker started" tối đa 90 giây.
- Thoát với mã khác 0 nếu app không khoẻ (in log cuối), app đang chạy rồi, hoặc cổng bận.
  Không lách qua một lần khởi động hỏng.
- Worker gọi Claude thật (`ANTHROPIC_API_KEY` trong `.env`): **tốn tiền**, ghi số lượt trong report.

### 2. Dữ liệu
- Staff và user đăng nhập: seed sẵn (`up.sh` đã chạy `make db-seed`), mật khẩu `credflow-dev`.
- Giấy giả lập: `eval/hard-cases/cpr/` (commit sẵn) hoặc `make synth` (`data/synth/cpr/`). Chỉ dữ liệu
  giả lập có watermark SAMPLE.

### 3. Chọn mức
Chọn mức rẻ nhất chứng minh được thay đổi (VERIFICATION.md, Rule 3).
Backend/pipeline → API trước (`make test-int` + gọi API đang chạy). Người dùng thấy được → kiểm thêm UI.

### 4. Điều khiển và quan sát

**API (L2):**
```bash
.claude/skills/verify/scripts/api.sh GET /health
.claude/skills/verify/scripts/api.sh --as staff-marisol@example.test POST /documents @eval/hard-cases/cpr/01-expires.png
.claude/skills/verify/scripts/api.sh --as staff-marisol@example.test GET /documents
```
Output: dòng `<status> <thời gian>` rồi body (cắt 2000 ký tự). `--as` đăng nhập bằng user seed, cookie
riêng mỗi email ở `.verify/`. Không `--as` là gọi chưa đăng nhập. `API_BODY_LIMIT=0` để in đủ body (đọc JSON chi tiết của một document).
- Kiểm thêm trạng thái DB khi cần:
  `docker compose exec -T db psql -U credflow -d credflow -c "SELECT id, status FROM documents ORDER BY created_at DESC LIMIT 5"`.

**UI (L3):** (cần `up.sh --web`)
```bash
pnpm exec tsx .claude/skills/verify/scripts/ui.mts --login staff-marisol@example.test \
  --path / --wait-text "Đã tự duyệt" --shot .verify/shots/<name>.png
```
Output JSON: url, status, title, `consoleErrors`, `failedRequests` (≥ 400), đường dẫn ảnh. Exit 1 khi
đăng nhập lỗi hoặc không thấy `--wait-text` trong 60 giây (vẫn chụp). Mở screenshot bằng tool Read
và nhìn thật sự. Không dùng Playwright MCP nữa (nó để lại `.playwright-mcp/`).

Thao tác nhiều bước (plan 28): thêm `--step` (lặp được, chạy theo thứ tự), ví dụ
```bash
pnpm exec tsx .claude/skills/verify/scripts/ui.mts --login reviewer@example.test --path /review \
  --wait-text "Hàng chờ duyệt" --step click:queue-open --step fill:field-completionDate=2025-09-02 \
  --step blur:field-completionDate --step gone:MISSING_FIELD --step click:decide-approve \
  --step url:/review/ --shot .verify/shots/approve.png
```
Bước: `click:<testid>`, `fill:<testid>=<giá trị>`, `select:<testid>=<giá trị>`, `blur:<testid>`,
`wait:<chữ>`, `gone:<chữ>`, `url:<chuỗi con>`, `goto:<path>`, `shot:<file>`, `sleep:<ms>` (chạy ui.mts nền rồi chen lệnh `api.sh` vào giữa, vd thử 409), `mark:<nhãn>` (plan 29: ghi ms vào `marks` để bấm giờ). Bước lỗi → dừng, exit 1,
JSON có `steps` ghi `FAIL <bước>: <lý do>`.

**Bước pipeline / LLM:**
```bash
make eval                       # golden set qua LLM thật (cache), ghi eval/runs/ + report.md
make eval ARGS=--no-save        # chạy thử, không ghi run/report
make eval-ci                    # cổng của CI: output ghi sẵn, 0 lời gọi LLM, không cần khoá
```
Báo `falseApproveRate` so với lần trước (mục tiêu 0) và ca duyệt nhầm. Đổi prompt/model/template
synth thì `make eval ARGS=--record` để ghi lại `eval/recorded/`.

### 4b. Tắt và dọn
```bash
.claude/skills/verify/scripts/down.sh --clean
```
Tắt process do `up.sh` bật; `--clean` liệt kê rồi xoá document (và file) tạo sau lúc `up.sh` chạy,
trên DB dev. Bắt buộc sau mỗi lần kiểm có tạo dữ liệu.

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

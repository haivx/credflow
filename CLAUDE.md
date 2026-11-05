# CLAUDE.md — CredFlow

Hệ thống xử lý giấy tờ credentialing cho công ty dịch vụ chăm sóc sức khoẻ: nhân viên upload giấy tờ, AI phân loại và trích xuất, rule engine kiểm tra, ca không chắc chuyển cho người duyệt.
Nguồn sự thật cấp sản phẩm: `docs/product.md`. Đọc file đó trước khi đề xuất hay làm task nào.

## Vai trò

- **Liam (owner):** quyết định sản phẩm, contract (`packages/contracts`), kiến trúc, rule, model; duyệt plan trước khi code.
- **Claude Code:** đề xuất plan, code toàn bộ plan (kể cả phần cốt lõi), viết test, chạy eval và báo cáo số liệu. Liam duyệt plan và PR.
- Không tự ý đổi contract, schema DB, cấu hình rule, prompt đã chốt hay model. Cần đổi thì dừng lại và đề xuất kèm lý do.

## Quyết định đáng nhớ

Mỗi plan có mục **"Quyết định đáng nhớ"**, 3–5 dòng: chỗ khó nhất, phương án đã loại và vì sao, khi nào cách này hỏng.

- **Giữ đúng mức:** gặp kiến thức vượt mức middle thì nói một câu là nó tồn tại, ghi vào "Học nâng cao" trong `docs/roadmap.md`, rồi làm tiếp bằng cách đơn giản đã chọn trong roadmap/ADR.
- **Lưu trạng thái sau mỗi bước:** xong một bước nhỏ thì cập nhật ngay mục "Đang làm" trong `docs/STATUS.md` (bước đã xong, bước tiếp theo, code đang dở, câu hỏi còn treo). Phiên có thể bị đóng bất cứ lúc nào mà không kịp `/wrap`.

## Quy trình làm việc

1. **Đầu phiên:** đọc `docs/STATUS.md` (đang ở đâu) và phase hiện tại trong `docs/roadmap.md`. Liam hỏi "đang ở đâu", "làm tiếp" hoặc gõ `/tiep` → tóm tắt từ STATUS + git rồi đề xuất bước tiếp.
2. **Task mới:** vào plan mode, viết plan vào `docs/plans/NN-<slug>.md` theo mẫu trong `docs/plans/README.md` (mục tiêu, file sẽ sửa, vùng kiến trúc bị chạm, contract bị ảnh hưởng, quyết định đáng nhớ, tiêu chí xong), cuối plan là **verification plan** (`docs/agent/templates/VERIFICATION_PLAN.md`). Chờ Liam duyệt cả hai rồi mới code.
3. **Code:** PR nhỏ, review được tại ranh giới (contract, rule engine, prompt, routing). Test đi cùng code. Chạm file trong vùng kiến trúc (`docs/agent/architecture-zones.txt`) thì phải khai trước trong plan, mục "Vùng kiến trúc bị chạm"; ngoài plan thì dừng lại hỏi. `.claude/settings.json` và `.claude/hooks/**` chỉ sửa bằng tool Edit/Write, không bằng script: chỉ tool mới hiện prompt để Liam duyệt. `main` chỉ nhận qua PR có CI xanh; **Liam tự merge**, Claude không merge.
4. **Kiểm chứng:** thay đổi hành vi → chạy skill `verify`, viết evidence report (`docs/agent/templates/EVIDENCE_REPORT.md`), dán mục Tóm tắt vào tin nhắn cuối và PR. Chi tiết ở mục "Kiểm chứng" bên dưới.
5. **Eval gate (từ P2):** mọi thay đổi về prompt, model, rule hoặc ngưỡng phải chạy `make eval` và dán bảng metric (so với lần trước) vào PR.
6. **Review trước khi báo sẵn sàng:** trước khi báo PR sẵn sàng, chạy subagent `pr-reviewer` (đã checkout nhánh, đưa đường dẫn plan và evidence report) và dán kết luận vào PR. "Cần sửa" thì sửa rồi chạy lại; chỗ không đồng ý thì vẫn dán và nêu lý do để Liam quyết. Reviewer không thay evidence report và không thay Liam.
7. **Cuối phiên:** cập nhật `docs/STATUS.md`. Quyết định kỹ thuật mới hoặc lệch `docs/product.md` → thêm ADR `docs/decisions/NNNN-<slug>.md`. Đổi spec sản phẩm: sửa `product.md` trước.

Lệnh tắt: `/tiep` (mở lại phiên, làm tiếp chỗ đang dở), `/next` (đề xuất task tiếp theo), `/wrap` (cập nhật STATUS, ADR cuối phiên).

## Kiểm chứng (bắt buộc)

Dự án kiểm chứng dựa trên bằng chứng: Liam duyệt plan **và** bằng chứng, Claude chứng minh thay đổi chạy được bằng cách chạy hệ thống thật. Rule đầy đủ: `docs/agent/VERIFICATION.md`; cách chạy: skill `verify` (`.claude/skills/verify/`).

Rule kiểm chứng:

- Không nói "xong / đã sửa / chạy được" khi chưa có bằng chứng từ phiên này.
- Bug: tái hiện (đỏ) → sửa → cùng bước tái hiện (xanh). Không sửa theo phỏng đoán.
- Mọi thay đổi hành vi có ít nhất một check ở L2 (server/API thật: `make test-int` hoặc gọi API đang chạy) trở lên.
- Test mới phải được cho thấy đỏ trên hành vi cũ thì mới được tính.
- Output LLM: kiểm bằng schema + bất biến + golden fixture (`make eval`), không bao giờ so nguyên văn.
- Không bao giờ nới một check, script, lint rule hay test để cho qua. Check sai thì nói ra và sửa nó ở một bước riêng, có ghi nhãn.

Liam phải chỉnh lại một lỗi Claude mắc (code sai, làm sai quy trình, review ghi "đừng làm X") → Claude ghi vào bảng **Watchlist** trong `docs/agent/GUARDRAILS.md`. Cùng kiểu lỗi gặp lần thứ hai → Claude đề xuất một rule cứng (lint, type, test, CI check) để máy tự chặn, không chỉ thêm lời nhắc.

Bậc tin cậy hiện tại: **2** (Liam duyệt plan + verification plan; Claude nộp bằng chứng).

## Nguyên tắc không được vi phạm

- **LLM chỉ đọc và trích xuất. Code ra quyết định.** LLM không bao giờ quyết định duyệt; không có đường code nào cho LLM gọi "approve".
- **Không chắc thì chuyển cho người.** Chỉ `auto_approve` khi mọi rule `block` đều qua. Hệ thống không bao giờ tự từ chối.
- **Có value thì phải có evidence.** Trường không có đoạn chữ gốc làm bằng chứng → coi như không chắc.
- **Metric quan trọng nhất là `falseApproveRate`, mục tiêu 0.** Đánh đổi recall (tỉ lệ tự duyệt) để giữ nó.
- **Rule engine là hàm thuần:** input (extraction, staff, config, asOf) → output (RuleResult[]). Không gọi LLM, không đọc file, không dùng `Date.now()` bên trong.
- **Không có dữ liệu cá nhân thật.** Chỉ dùng giấy tờ giả lập có watermark SAMPLE, tên và tổ chức hư cấu (`docs/data-policy.md`). Không commit `.env`, file upload, `real-docs/`.
- Rule và danh sách tổ chức trong `config/rules/` là cấu hình minh hoạ, không nhận là quy định pháp lý.
- Mỗi kết quả lưu kèm `versions {pipeline, prompt, model, rules}` để eval và audit tái lập được.

## Cấu trúc repo

```
apps/web/            Next.js 14: portal upload, hàng chờ duyệt, màn duyệt, dashboard
apps/api/            NestJS 12 (ESM, build bằng SWC): HTTP (main.ts) + BullMQ worker (worker.ts), gọi LLM (phân loại, trích xuất)
packages/contracts/  Zod schema dùng chung, nguồn sự thật cho kiểu dữ liệu (đã chốt ở P0; đổi phải qua Liam)
packages/rules/      Rule engine thuần + đọc config
config/rules/        Cấu hình rule theo khách hàng (YAML, validate bằng RulesConfig)
eval/                Harness eval, hard-cases/ (ca khó làm tay, giả lập), report.md
tools/synth/         Bộ sinh giấy tờ giả lập + đáp án
docs/                product.md, flows.md, doc-types.md, data-policy.md, roadmap.md, STATUS.md, plans/, decisions/, research/, learning/ (lưu trữ, dừng cập nhật 2026-11-05), agent/ (rule kiểm chứng, guardrails, mẫu)
.claude/             commands/ (/tiep, /next, /wrap), agents/ (pr-reviewer), hooks/, skills/verify/ (quy trình kiểm chứng, FEATURE_MAP.md), settings.json (deny + ask dùng chung, guardrail A8)
```

## Lệnh

```
make setup      # pnpm install --frozen-lockfile + bật Postgres và Redis (--wait) + migrate + seed; chạy lại an toàn
make dev        # API 127.0.0.1:8787 + worker (không mở cổng) + web localhost:3000 + tsc --watch cho packages
make dev-api    # chỉ API (nest start --watch, SWC); make dev-worker, make dev-web tương tự
make build-packages  # tsc packages/* → dist/ (test, dev, eval, synth tự chạy trước, ADR 0003)
make db-generate # drizzle-kit: sinh migration từ apps/api/src/db/schema.ts → apps/api/drizzle/
make db-migrate  # chạy migration chưa áp vào DATABASE_URL
make db-seed     # seed 10 staff + 3 user đăng nhập giả lập (idempotent)
make test       # vitest mọi package (unit test, không cần docker)
make test-int   # integration test apps/api: bật db-test (cổng 5433, tmpfs) + Redis, chạy migration, supertest
make typecheck  # tsc mọi package
make lint       # eslint (có type-check cho apps/api, packages; guardrail A3/A5/A9/A14) + prettier --check + test lint (tools/lint/)
make format     # prettier --write: sửa định dạng khi make lint báo lỗi prettier
make eval       # chạy golden set → eval/report.md (P2)
make synth      # sinh dữ liệu giả lập → data/synth/ (P2), SEED= tuỳ chọn
```

CI (`.github/workflows/ci.yml`): mỗi PR và push lên `main` chạy `build-packages`, `lint`, `typecheck`, `test`, `test-int`.

(Cập nhật mục này khi đổi Makefile.)

## Code style

- TypeScript strict, không `any`. Zod ở mọi ranh giới I/O: request/response API, output LLM, file config, golden set.
- Output LLM luôn parse bằng schema trong `packages/contracts`; parse lỗi → retry có giới hạn → `needs_review`, không đoán.
- Ngày là chuỗi `YYYY-MM-DD`, không dùng `Date` cho ngày lịch (tránh lệch múi giờ).
- Prompt nằm trong file riêng có version (`apps/api/src/prompts/<name>@<n>.md`), không viết inline trong code.

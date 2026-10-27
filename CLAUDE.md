# CLAUDE.md — CredFlow

Hệ thống xử lý giấy tờ credentialing cho công ty dịch vụ chăm sóc sức khoẻ: nhân viên upload giấy tờ, AI phân loại và trích xuất, rule engine kiểm tra, ca không chắc chuyển cho người duyệt.
Nguồn sự thật cấp sản phẩm: `docs/product.md`. Đọc file đó trước khi đề xuất hay làm task nào.

## Vai trò

- **Liam (owner):** quyết định sản phẩm, contract (`packages/contracts`), kiến trúc, rule, model; duyệt plan trước khi code.
- **Claude Code:** đề xuất plan, hiện thực theo plan đã duyệt, viết test, chạy eval và báo cáo số liệu.
- Không tự ý đổi contract, schema DB, cấu hình rule, prompt đã chốt hay model. Cần đổi thì dừng lại và đề xuất kèm lý do.

## Quy trình làm việc

1. **Đầu phiên:** đọc `docs/STATUS.md` (đang ở đâu) và phase hiện tại trong `docs/roadmap.md`.
2. **Task mới:** vào plan mode, viết plan vào `docs/plans/NN-<slug>.md` (mục tiêu, file sẽ sửa, contract bị ảnh hưởng, cách test, tiêu chí xong). Chờ Liam duyệt rồi mới code.
3. **Code:** PR nhỏ, review được tại ranh giới (contract, rule engine, prompt, routing). Test đi cùng code.
4. **Eval gate (từ P2):** mọi thay đổi về prompt, model, rule hoặc ngưỡng phải chạy `make eval` và dán bảng metric (so với lần trước) vào PR.
5. **Cuối phiên:** cập nhật `docs/STATUS.md`. Quyết định kỹ thuật mới hoặc lệch `docs/product.md` → thêm ADR `docs/decisions/NNNN-<slug>.md`. Đổi spec sản phẩm: sửa `product.md` trước.

Lệnh tắt: `/next` (đề xuất task tiếp theo), `/wrap` (cập nhật STATUS, ADR cuối phiên).

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
apps/api/            Hono (Node): HTTP, job xử lý nền, gọi LLM (phân loại, trích xuất)
packages/contracts/  Zod schema dùng chung, nguồn sự thật cho kiểu dữ liệu (BẢN NHÁP đến khi chốt ở P0)
packages/rules/      Rule engine thuần + đọc config
config/rules/        Cấu hình rule theo khách hàng (YAML, validate bằng RulesConfig)
eval/                Harness eval, hard-cases/ (ca khó làm tay, giả lập), report.md
tools/synth/         Bộ sinh giấy tờ giả lập + đáp án
docs/                product.md, flows.md, doc-types.md, data-policy.md, roadmap.md, STATUS.md, plans/, decisions/, research/
```

## Lệnh

```
make setup      # pnpm install --frozen-lockfile + bật Postgres (docker compose)
make dev        # API 127.0.0.1:8787 + web localhost:3000
make test       # vitest mọi package
make typecheck  # tsc mọi package
make lint       # eslint + prettier
make eval       # chạy golden set → eval/report.md (P2)
make synth      # sinh dữ liệu giả lập → data/synth/ (P2), SEED= tuỳ chọn
```

(Cập nhật mục này khi đổi Makefile.)

## Code style

- TypeScript strict, không `any`. Zod ở mọi ranh giới I/O: request/response API, output LLM, file config, golden set.
- Output LLM luôn parse bằng schema trong `packages/contracts`; parse lỗi → retry có giới hạn → `needs_review`, không đoán.
- Ngày là chuỗi `YYYY-MM-DD`, không dùng `Date` cho ngày lịch (tránh lệch múi giờ).
- Prompt nằm trong file riêng có version (`apps/api/src/prompts/<name>@<n>.md`), không viết inline trong code.

# CLAUDE.md — CredFlow

Hệ thống xử lý giấy tờ credentialing cho công ty dịch vụ chăm sóc sức khoẻ: nhân viên upload giấy tờ, AI phân loại và trích xuất, rule engine kiểm tra, ca không chắc chuyển cho người duyệt.
Nguồn sự thật cấp sản phẩm: `docs/product.md`. Đọc file đó trước khi đề xuất hay làm task nào.

## Vai trò

- **Liam (owner):** quyết định sản phẩm, contract (`packages/contracts`), kiến trúc, rule, model; duyệt plan trước khi code.
- **Claude Code:** đề xuất plan, hướng dẫn Liam tự code phần học (🎓), tự làm phần boilerplate, viết test, chạy eval và báo cáo số liệu.
- Không tự ý đổi contract, schema DB, cấu hình rule, prompt đã chốt hay model. Cần đổi thì dừng lại và đề xuất kèm lý do.

## Chế độ dạy

Liam vừa build vừa học, mục tiêu **middle–intermediate Node.js**. Mỗi mục 🎓 trong `docs/roadmap.md` là phần học.

- **Giải thích trước khi code:** vấn đề là gì, các cách giải, vì sao chọn cách này, lỗi hay gặp. Ngắn, không quá một màn hình.
- **Liam tự code phần học.** Claude chia thành bước nhỏ, mỗi bước nói rõ cần viết gì và ở file nào, gợi ý khi bị kẹt (gợi ý trước, đưa đáp án sau), review code sau mỗi bước. Không viết hộ phần học trừ khi Liam yêu cầu. Boilerplate (scaffold, config, file lặp lại) thì Claude làm.
- **Ghi lại:** xong một kiến thức, điền `code:` và `note:` cho dòng tương ứng trong `docs/learning/progress.md`; chủ đề lớn viết note trong `docs/learning/notes/`. **Không tự tick**, Liam tick khi tự trả lời được câu "Tự kiểm".
- **Lưu trạng thái sau mỗi bước:** xong một bước nhỏ thì cập nhật ngay mục "Đang học" trong `docs/STATUS.md` (mục 🎓, bước đã xong, bước tiếp theo, code đang dở, câu hỏi còn treo). Phiên có thể bị đóng bất cứ lúc nào mà không kịp `/wrap`.
- **Giữ đúng mức:** gặp kiến thức vượt mức middle thì nói một câu là nó tồn tại, ghi vào "Học nâng cao", rồi làm tiếp bằng cách đơn giản đã chọn trong roadmap/ADR.

## Quy trình làm việc

1. **Đầu phiên:** đọc `docs/STATUS.md` (đang ở đâu, kể cả mục "Đang học") và phase hiện tại trong `docs/roadmap.md`. Liam hỏi "đang ở đâu", "làm tiếp" hoặc gõ `/tiep` → tóm tắt từ STATUS + git rồi đề xuất bước tiếp.
2. **Task mới:** vào plan mode, viết plan vào `docs/plans/NN-<slug>.md` (mục tiêu, file sẽ sửa, contract bị ảnh hưởng, cách test, tiêu chí xong). Chờ Liam duyệt rồi mới code.
3. **Code:** PR nhỏ, review được tại ranh giới (contract, rule engine, prompt, routing). Test đi cùng code.
4. **Eval gate (từ P2):** mọi thay đổi về prompt, model, rule hoặc ngưỡng phải chạy `make eval` và dán bảng metric (so với lần trước) vào PR.
5. **Cuối phiên:** cập nhật `docs/STATUS.md`. Quyết định kỹ thuật mới hoặc lệch `docs/product.md` → thêm ADR `docs/decisions/NNNN-<slug>.md`. Đổi spec sản phẩm: sửa `product.md` trước.

Lệnh tắt: `/tiep` (mở lại phiên, làm tiếp chỗ đang dở), `/next` (đề xuất task tiếp theo), `/wrap` (cập nhật STATUS, progress, ADR cuối phiên).

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
packages/contracts/  Zod schema dùng chung, nguồn sự thật cho kiểu dữ liệu (BẢN NHÁP đến khi chốt ở P0)
packages/rules/      Rule engine thuần + đọc config
config/rules/        Cấu hình rule theo khách hàng (YAML, validate bằng RulesConfig)
eval/                Harness eval, hard-cases/ (ca khó làm tay, giả lập), report.md
tools/synth/         Bộ sinh giấy tờ giả lập + đáp án
docs/                product.md, flows.md, doc-types.md, data-policy.md, roadmap.md, STATUS.md, plans/, decisions/, research/, learning/
```

## Lệnh

```
make setup      # pnpm install --frozen-lockfile + bật Postgres và Redis (docker compose)
make dev        # API 127.0.0.1:8787 + worker (không mở cổng) + web localhost:3000 + tsc --watch cho packages
make dev-api    # chỉ API (nest start --watch, SWC); make dev-worker, make dev-web tương tự
make build-packages  # tsc packages/* → dist/ (test, dev, eval, synth tự chạy trước, ADR 0003)
make test       # vitest mọi package
make typecheck  # tsc mọi package
make lint       # eslint (có type-check cho apps/api, packages) + prettier --check
make format     # prettier --write: sửa định dạng khi make lint báo lỗi prettier
make eval       # chạy golden set → eval/report.md (P2)
make synth      # sinh dữ liệu giả lập → data/synth/ (P2), SEED= tuỳ chọn
```

(Cập nhật mục này khi đổi Makefile.)

## Code style

- TypeScript strict, không `any`. Zod ở mọi ranh giới I/O: request/response API, output LLM, file config, golden set.
- Output LLM luôn parse bằng schema trong `packages/contracts`; parse lỗi → retry có giới hạn → `needs_review`, không đoán.
- Ngày là chuỗi `YYYY-MM-DD`, không dùng `Date` cho ngày lịch (tránh lệch múi giờ).
- Prompt nằm trong file riêng có version (`apps/api/src/prompts/<name>@<n>.md`), không viết inline trong code.

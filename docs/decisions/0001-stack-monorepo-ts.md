# 0001 · Stack: monorepo TypeScript, Next.js + Hono + Postgres + pg-boss

Ngày: 2026-10-27 · Trạng thái: **Đề xuất** (Liam chốt ở P0) · Người quyết: Liam

## Bối cảnh

Dự án là case study cho vị trí fullstack / AI product engineer / FDE: cần chứng minh làm được fullstack Node và đưa AI vào một quy trình nghiệp vụ. Làm một mình cùng Claude Code, trong khoảng 5–6 tuần. Thế mạnh sẵn có: Next.js, TypeScript, Zod.

## Quyết định đề xuất

1. **Một ngôn ngữ: TypeScript** cho web, API, rule engine, eval và bộ sinh dữ liệu. Python để sau nếu cần (ví dụ so sánh OCR ở P5).
2. **pnpm workspace:** `apps/web`, `apps/api`, `packages/contracts`, `packages/rules`, `eval`, `tools/synth`.
3. **Web:** Next.js 14 App Router, Tailwind + shadcn/ui, TanStack Query.
4. **API tách riêng: Hono trên Node**, thay vì route handler của Next.js. Lý do: job xử lý nền chạy lâu, cần process riêng; thể hiện rõ phần backend.
5. **Postgres 16 + Drizzle ORM**; **pg-boss** làm job queue (chạy trên chính Postgres, không thêm Redis).
6. **Zod 4** trong `packages/contracts` là nguồn sự thật cho kiểu dữ liệu; output LLM, request API, config và golden set đều parse bằng nó.
7. **Rule engine là package riêng, hàm thuần**, để test và eval không cần DB hay LLM.

## Phương án đã cân nhắc

- Fastify thay Hono: chín hơn, nhiều plugin; Hono gọn, type tốt, dễ deploy lên nhiều runtime. Cả hai đều ổn.
- Supabase thay Postgres tự chạy: nhanh hơn ở phần auth/storage, nhưng che mất phần backend cần thể hiện; có thể dùng Supabase làm Postgres khi deploy.
- BullMQ + Redis: phổ biến, nhưng thêm một dịch vụ; khối lượng job nhỏ, pg-boss đủ.

## Hệ quả

- `make setup` cần Docker để chạy Postgres.
- Thêm Drizzle và pg-boss ở P0 (skeleton chưa cài).
- Đổi bất kỳ mục nào ở trên → sửa ADR này hoặc thêm ADR mới.

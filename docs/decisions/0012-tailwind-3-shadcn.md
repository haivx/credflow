# 0012 · Tailwind 3 + shadcn/ui (style new-york) trên Next 14

Trạng thái: Đã chốt · Ngày: 2026-11-07 · Plan: `docs/plans/30-nen-ui-s1.md`

## Bối cảnh

ADR 0001 chọn Tailwind + shadcn/ui + TanStack Query cho web, nhưng P1 và P4 làm UI tối giản bằng style inline. P4.5 (thêm 2026-11-07) dựng UI thật. Tailwind hiện có hai dòng: v3 (cấu hình `tailwind.config.ts` + PostCSS) và v4 (cấu hình trong CSS). Bản shadcn mới nhắm Tailwind 4 + React 19, còn web đang ở Next 14 + React 18.

## Quyết định (Liam chốt 2026-11-07)

- Tailwind **3.4** qua PostCSS, cấu hình như shadcn cho v3: màu là CSS variable trong `app/globals.css`, `tailwind.config.ts` map sang `hsl(var(--…))`, plugin `tailwindcss-animate`.
- shadcn/ui style `new-york`, màu nền `neutral`, primary teal. Code component chép vào `apps/web/components/ui` từ registry v3 (`ui.shadcn.com/r/styles/new-york/<tên>.json`), đọc từng file trước khi commit. Không chạy CLI `shadcn` trong repo vì nó tự `pnpm add` dependency không kèm version.
- `tailwind-merge` **2.x** (3.x chỉ hỗ trợ Tailwind 4).
- Mọi dependency mới cố định version, chọn bản đã phát hành ít nhất 2 tuần.
- TanStack Query 5 cho dữ liệu; `apiFetch` (parse bằng Zod của contracts) vẫn là cửa duy nhất gọi API.
- Font hệ thống, không dùng `next/font/google` (tải font lúc build).

## Phương án đã loại

- **Tailwind 4 ngay:** nên đi cùng nâng Next 15 / React 19; nâng framework nằm ngoài phạm vi P4.5.
- **Radix `Select` thay `<select>` gốc:** đẹp hơn nhưng bước `select:` của `ui.mts` và bàn phím ảo trên điện thoại cần `<select>` thật.
- **Thư viện component khác (MUI, Mantine):** lệch ADR 0001, kéo theo runtime CSS-in-JS.

## Hệ quả

- Nâng Next 15 / Tailwind 4 sau này: chạy lại cấu hình shadcn cho v4, đổi `tailwind-merge` 3, so tay từng file trong `components/ui` (code đã chép vào repo, không tự nâng).
- Thêm Tailwind thì preflight áp cho mọi màn; màn chưa chuyển phải bọc `data-legacy` (plan 30, bỏ ở plan 31).

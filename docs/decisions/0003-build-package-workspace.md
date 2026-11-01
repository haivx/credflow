# 0003 · Package workspace build bằng `tsc` ra `dist/`

Ngày: 2026-11-01 · Trạng thái: Chấp nhận · Người quyết: Liam

## Bối cảnh

`packages/contracts` và `packages/rules` export thẳng `./src/index.ts`. Cách này chạy được với `tsx` và bundler, nhưng `apps/api` build bằng SWC ra `dist/` rồi chạy bằng `node`, mà `node` không đọc được file `.ts` nằm trong `node_modules`. Plan 02 ghi lại rủi ro này, plan 03 xử lý.

## Quyết định

1. Mỗi package có `tsconfig.build.json`, build bằng `tsc` ra `dist/` (bỏ file test, không emit `.d.ts`).
2. `exports`: `types` → `./src/index.ts`, `default` → `./dist/index.js`. Typecheck và editor đọc `src`, còn lúc chạy (`node`, Vitest, `tsx`, Next) thì đọc `dist`.
3. Package dùng `module` / `moduleResolution` là `NodeNext`, import tương đối phải có đuôi `.js`.
4. `make build-packages` chạy trước `test`, `dev-*`, `eval`, `synth`. `make dev` chạy thêm `tsc --watch` cho package.

## Lý do

- Đây là cách phổ biến, và chạy được cả khi deploy: `dist/` của API chỉ cần `dist/` của package.
- Không chọn để SWC của Nest biên dịch luôn code package, vì như vậy package bị dính vào cách build của một app và phá ranh giới package.
- `types` trỏ vào `src` nên typecheck không phải chờ build và không cần quản lý `.d.ts`.

## Hệ quả

- Sửa package khi đang chạy `make dev`: `tsc --watch` build lại `dist/`, nhưng `nest start --watch` chỉ theo dõi `apps/api/src`, nên cần lưu lại một file trong API (hoặc restart) để API nạp code mới.
- Quên đuôi `.js` thì `make typecheck` báo lỗi ngay, không đợi tới lúc chạy.
- Chạy `vitest`/`tsx` trực tiếp, không qua `make`, mà chưa build thì sẽ lỗi không tìm thấy `dist/index.js`.

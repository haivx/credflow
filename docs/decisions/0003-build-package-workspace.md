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
- Phải viết đuôi `.js` là luật của ESM, không phải của Nest: Nest 12 cho chọn CommonJS hoặc ESM khi `nest new` (mặc định ESM), và app CommonJS vẫn chạy Nest 12 được. Repo chọn ESM vì đó là mặc định của Nest 12, mọi `package.json` vốn đã là `"type": "module"`, và nhiều thư viện mới chỉ phát hành ESM.

## Phương án đã cân nhắc

- **esbuild/tsup bundle package để bỏ đuôi `.js`.** Đã thử (2026-11-01): bỏ `.js` trong `packages/rules/src/index.ts` thì `apps/api` (`NodeNext`) typecheck lỗi TS2835 ở file của package, vì `types` trỏ vào `src` nên TypeScript đọc `src` theo luật của app dùng nó. Muốn bỏ `.js` thật thì `types` phải trỏ vào `.d.ts` sinh ra trong `dist/`: vẫn cần `tsc` để sinh `.d.ts`, typecheck phải build trước, sửa contract phải chờ build mới thấy kiểu mới. Thêm tool mà chỉ đổi được việc không viết `.js`, trong khi `apps/api` vẫn phải viết `.js`. Không chọn.
- **esbuild chỉ biên dịch, không bundle.** esbuild giữ nguyên chuỗi import giống `tsc`, nên vẫn phải viết `.js`. Nhanh hơn nhưng với package cỡ này không đáng thêm tool.
- **Chuyển backend về CommonJS.** Bỏ được `.js`, nhưng phải đổi test sang Jest (hoặc tự cấu hình Vitest cho CommonJS), đổi cả `contracts`/`rules`, và đi ngược mặc định của Nest 12. Không chọn.

## Hệ quả

- Sửa package khi đang chạy `make dev`: `tsc --watch` build lại `dist/`, nhưng `nest start --watch` chỉ theo dõi `apps/api/src`, nên cần lưu lại một file trong API (hoặc restart) để API nạp code mới.
- Quên đuôi `.js` thì `make typecheck` báo lỗi ngay, không đợi tới lúc chạy.
- Chạy `vitest`/`tsx` trực tiếp, không qua `make`, mà chưa build thì sẽ lỗi không tìm thấy `dist/index.js`.

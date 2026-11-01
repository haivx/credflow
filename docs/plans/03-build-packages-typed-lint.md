# 03 · Build package workspace ra `dist/` và bật `no-floating-promises`

Phase: P0 · Trạng thái: Xong · Ngày: 2026-11-01

## Mục tiêu

Hai việc để lại từ plan 02 (Rủi ro 1 và đề xuất ESLint), Liam chọn theo đề xuất ngày 2026-11-01:

1. `packages/contracts` và `packages/rules` build bằng `tsc` ra `dist/` để `node dist/main.js` của API (và `tsx` của eval/synth) import được lúc chạy.
2. Bật `@typescript-eslint/no-floating-promises` (lint có type-check) cho `apps/api` và `packages/*`.

Không có mục 🎓: đây là config/boilerplate.

## Phạm vi

- Trong: `package.json`, `tsconfig` của hai package; đuôi `.js` cho import tương đối trong `src/`; Makefile; `eslint.config.mjs`.
- Ngoài: nội dung schema trong `packages/contracts` (không đổi một dòng schema nào), API import thật hai package (để plan sau, khi cần config Zod).

## Thay đổi

| File / module | Thay đổi |
| --- | --- |
| `packages/{contracts,rules}/package.json` | `exports`: `types` → `./src/index.ts`, `default` → `./dist/index.js`. Thêm script `build` (`tsc -p tsconfig.build.json`) và `dev` (thêm `--watch`). |
| `packages/{contracts,rules}/tsconfig.json` | `module` / `moduleResolution`: `NodeNext`, để `tsc` bắt import thiếu đuôi `.js`. |
| `packages/{contracts,rules}/tsconfig.build.json` | Mới: emit ra `dist/`, bỏ `*.test.ts`. |
| `packages/*/src/**/*.ts` | Import tương đối thêm đuôi `.js` (`./common` → `./common.js`). Chỉ đổi đường dẫn import. |
| `Makefile` | Thêm `build-packages`; `test`, `dev-*`, `eval`, `synth` chạy nó trước; `dev` watch package song song. |
| `eslint.config.mjs` | Block cho `apps/api` và `packages/*/src`: `parserOptions.projectService`, rule `no-floating-promises: error`. |

### Vì sao `types` trỏ `src`, `default` trỏ `dist`

- `tsc --noEmit` và editor đọc thẳng `src`: không cần build mới typecheck được, và "Go to definition" nhảy vào code thật.
- Lúc chạy, `node`, Vitest, `tsx` và Next đều lấy `dist/index.js`. Vì vậy `make test` và `make dev` phải build package trước.
- Không cần emit `.d.ts`.

### Vì sao phải thêm `.js`

Node ESM không tự đoán đuôi file. `tsc` giữ nguyên chuỗi import khi emit, nên `import "./common"` trong `dist/` sẽ lỗi `ERR_MODULE_NOT_FOUND`. Viết `./common.js` trong file `.ts` là quy ước của TypeScript với `NodeNext`: TypeScript hiểu là trỏ tới `common.ts`, còn Node lúc chạy tìm thấy `common.js`.

## Contract / config / prompt bị ảnh hưởng

`packages/contracts`: chỉ đổi `package.json`, `tsconfig` và đuôi import. Schema giữ nguyên. Liam đã duyệt hướng làm ngày 2026-11-01.

## Test và cách kiểm tra

- `make test`, `make typecheck`, `make lint` pass.
- Kiểm tay: `node -e 'import("@credflow/rules")'` từ `apps/api` chạy được (trước đây lỗi vì `.ts`).
- Kiểm rule mới: tạm thêm một promise không `await` trong `apps/api/src`, `make lint` phải báo lỗi rồi bỏ đi.

## Tiêu chí xong

- [x] `pnpm --filter "./packages/*" build` ra `dist/index.js` cho cả hai package.
- [x] Từ `apps/api`, `node` import được `@credflow/contracts` và `@credflow/rules`.
- [x] `make test`, `make typecheck`, `make lint` pass.
- [x] `no-floating-promises` báo lỗi trên một promise bị bỏ quên.
- [x] Mục Lệnh trong `CLAUDE.md` và `docs/STATUS.md` cập nhật; ADR 0003 ghi quyết định build package.

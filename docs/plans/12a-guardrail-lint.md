# 12a · Guardrail lint: A3, A5, A9

Phase: P1 · Trạng thái: Xong · Ngày: 2026-11-04

> Số `12a`: plan 12 vẫn để cho BullMQ, vì `GUARDRAILS.md` (A10, A11) đang trỏ tới "plan 12".

## Mục tiêu

Ba luật đang ⏳/🟡 trong `docs/agent/GUARDRAILS.md` có gờ cứng. Vi phạm làm `make lint` đỏ (và vì vậy CI đỏ), message trỏ thẳng về mã luật:

- **A3:** `packages/rules` là hàm thuần (không I/O, không framework, không đồng hồ, không ngẫu nhiên, không console).
- **A5:** `packages/*` không tạo `Date` (ngày lịch là chuỗi `YYYY-MM-DD`).
- **A9:** mọi `eslint-disable` phải có lý do và không được thừa.

Thêm `purity.test.ts` để kiểm A3 lúc chạy (runtime), bổ sung cho kiểm tĩnh.

## Phạm vi

- **Trong:**
  - devDependency `@eslint-community/eslint-plugin-eslint-comments@^4.8.1` ở root.
  - 3 block mới trong `eslint.config.mjs`.
  - Test cho config lint: chạy ESLint thật trên các đoạn code vi phạm cố ý.
  - `packages/rules/src/purity.test.ts`.
  - Cập nhật `GUARDRAILS.md`.
- **Ngoài:**
  - A2 (`JSON.parse`), A8 (CI cảnh báo vùng kiến trúc), A10–A12: các plan sau.
  - Cấm `Date` ở `apps/*`. API cần timestamp thật (`createdAt`, session hết hạn), nên A5 chỉ áp cho `packages/*`.
  - Sửa code ứng dụng. Lint báo ở chỗ nào ngoài các vi phạm cố ý thì dừng lại báo Liam.

## Thiết kế: hai block cùng đụng `no-restricted-syntax`

Trong flat config, khi nhiều object cùng khớp một file và cùng đặt một rule, **object sau thay luôn options của object trước, không cộng dồn** (docs ESLint, "Configure Rules": "the later object taking precedence"). `packages/rules/src/engine.ts` khớp cả block A5 lẫn block A3. Nếu viết hai mảng selector riêng, engine chỉ còn selector của block đặt sau.

Cách xử lý: khai báo selector thành hằng ở đầu file, block A3 dùng **A5 + A3**:

```js
const A5_NO_DATE = [
  { selector: "NewExpression[callee.name='Date']", message: "A5: ..." },
  { selector: "CallExpression[callee.name='Date']", message: "A5: ..." }, // Date() không có new
  { selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']", message: "A5: ..." },
];
const A3_PURE = [
  // Liam viết: Math.random(), console.*
];

// block A5: packages/*/src/**/*.ts
{ "no-restricted-syntax": ["error", ...A5_NO_DATE] }
// block A3 (đặt SAU block A5): packages/rules/src/**/*.ts
{ "no-restricted-syntax": ["error", ...A5_NO_DATE, ...A3_PURE] }
```

`--print-config packages/rules/src/engine.ts` phải liệt kê đủ cả hai bộ. Test lint (bên dưới) cũng kiểm chuyện này, nên sau này có ai xoá `...A5_NO_DATE` khỏi block A3 thì test đỏ.

`CallExpression[callee.name='Date']` (gọi `Date()` không có `new`, trả về chuỗi giờ hiện tại) là selector mình thêm ngoài danh sách gốc. Nó cùng một lỗ với `new Date()`.

## Thay đổi

| File / module | Thay đổi |
| --- | --- |
| `package.json`, `pnpm-lock.yaml` | thêm `@eslint-community/eslint-plugin-eslint-comments` `^4.8.1` (devDependency) |
| `eslint.config.mjs` | thêm `linterOptions.reportUnusedDisableDirectives: "error"`; `comments.recommended` + `require-description: "error"` (A9); block A5 `packages/*/src/**/*.ts` (ignores `**/*.test.ts`, `packages/rules/src/config.ts`); block A3 `packages/rules/src/**/*.ts` (ignores như trên) với `no-restricted-imports`, `no-restricted-globals` (`fetch`, `process`), `no-restricted-syntax` (A5 + A3). Mỗi message bắt đầu bằng mã luật, vd `"A3: rule engine là hàm thuần, truyền asOf vào"` |
| `tools/lint/guardrails.test.mjs` (mới) | `node:test` + `ESLint#lintText(code, { filePath })` trên đường dẫn thật. Ca vi phạm: `Date.now()`, `new Date()`, `import "node:fs"`, `import "@nestjs/common"`, `fetch`, `process.env`, `Math.random()`, `console.log` trong `engine.ts`; `new Date()` trong `packages/contracts/src/common.ts`; `// eslint-disable-next-line` không lý do. Ca **không** được báo: `node:fs` trong `packages/rules/src/config.ts`, `Date.now()` trong `rules.test.ts`, `new Date()` trong `apps/api/src/...`, `import type` từ `@credflow/contracts` trong engine |
| `Makefile` | `lint:` thêm dòng `node --test tools/lint/` để CI chạy luôn test lint. Cập nhật mục "Lệnh" trong CLAUDE.md |
| `packages/rules/src/purity.test.ts` (mới) | xem mục dưới |
| `docs/agent/GUARDRAILS.md` | A3, A5, A9 → ✅; cột gờ ghi tên block/hằng trong `eslint.config.mjs`; A5 ghi rõ "chỉ `packages/*`". Gộp luôn bản sửa bảng Liam đang để chưa commit; bỏ heading `## Active (đã cưỡng chế)` rỗng còn sót |

`no-restricted-imports` cho A3:

- `paths`: `fs`, `path`, `yaml`, `drizzle-orm`, `@credflow/api`
- `patterns`: `node:*`, `@nestjs/*`, `drizzle-orm/*`, `@credflow/api/*`

Message chung: `"A3: rule engine không I/O, không framework; đọc file ở config.ts hoặc phía gọi"`.

### `purity.test.ts`

`evaluateRules` hiện vẫn `throw "Chưa hiện thực"`, nên chia hai phần:

| Ca | Bây giờ | Khi CPR rule có code (plan rule P1) |
| --- | --- | --- |
| `route()`: gọi 2 lần cùng input → `toEqual` nhau | `it` | giữ |
| `route()`: input `deepFreeze` → không throw, input không đổi | `it` | giữ |
| `route()`: `vi.useFakeTimers()` + `vi.setSystemTime()` hai mốc khác nhau → cùng kết quả | `it` | giữ |
| `evaluateRules()`: deterministic, không sửa input đã freeze, đổi đồng hồ không đổi kết quả khi `asOf` giữ nguyên | `it.todo` (3 ca) | đổi thành `it`. Plan rule CPR ghi việc này vào tiêu chí xong |

`deepFreeze` là helper nhỏ trong file test, không export.

## Liam tự viết (đổi: Claude viết theo yêu cầu Liam, 2026-11-04)

**Hai selector trong `A3_PURE`:** `Math.random()` và mọi `console.*` (`console.log`, `console.error`…).

- Claude viết trước các ca trong `tools/lint/guardrails.test.mjs` cho hai selector này. Chạy `node --test tools/lint/` phải thấy **đỏ** (lint không báo gì vì chưa có selector).
- Liam viết selector + message, chạy lại cho tới khi xanh.
- Gợi ý nếu kẹt: đi từ hình dạng AST (dán `Math.random()` vào https://typescript-eslint.io/play, tab AST) và nhìn selector `Date.now` có sẵn. Gợi ý trước, đáp án sau.
- 🎓 nhỏ: ESLint selector giống CSS selector chạy trên AST. Không có dòng nào trong `progress.md` cho mục này, mình sẽ không thêm trừ khi Liam muốn.

## Contract / config / prompt bị ảnh hưởng

Không đổi contract, schema DB, rule config hay prompt. Lint config thuộc vùng A8 (Liam duyệt): plan này chính là lần duyệt đó.

## Tiêu chí xong

- [ ] `make lint` (có cả `node --test tools/lint/`), `make typecheck`, `make test` xanh trên code thật, không sửa code ứng dụng.
- [ ] Mỗi vi phạm cố ý làm `make lint` đỏ với message có mã luật.
- [ ] `--print-config packages/rules/src/engine.ts` cho thấy đủ selector A3 + A5.
- [ ] `GUARDRAILS.md`: A3, A5, A9 ✅.
- [ ] Evidence report (skill `verify`) có trong PR, kết quả ✅ hoặc phần chưa kiểm đã được Liam chấp nhận.

## Rủi ro / câu hỏi

1. **Thêm test lint vào `make lint`.** Mình đề xuất có, vì kiểm bằng tay mỗi lần là thứ dễ bị bỏ. Nếu Liam muốn giữ `make lint` chỉ là eslint + prettier, mình tách thành `make lint-guardrails` và CI gọi riêng.
2. **`lintText` với file có type-check.** Block typed lint dùng `projectService`. `lintText` trên đường dẫn có thật trong tsconfig sẽ chạy được. Nếu typescript-eslint báo lỗi parser, test sẽ lint bằng một instance `ESLint` có `overrideConfig` tắt `projectService`. Các rule A3/A5/A9 đều không cần type nên kết quả không đổi.
3. `process` bị cấm trong engine. `globalThis.process` vẫn lọt qua `no-restricted-globals`. Mình không chặn thêm: ca này hiếm, và purity test runtime vẫn đứng sau.

## Verification plan

**Mức rủi ro:** T1. Chỉ là tooling, đảo ngược được, không đổi hành vi app. Lưu ý: lint config là vùng A8, nên Liam xem diff `eslint.config.mjs`.

**Hành vi kỳ vọng (theo cách người dùng nói):**

- Ai viết `Date.now()`, `new Date()`, `Math.random()`, `console.*`, `fetch`, `process`, hoặc import I/O/framework trong rule engine → `make lint` đỏ, message bắt đầu `A3:`/`A5:`.
- Ai viết `new Date()` trong `packages/contracts` → đỏ `A5:`.
- Ai viết `eslint-disable` không lý do, hoặc disable một rule không báo gì → đỏ.
- Code hiện tại (gồm `config.ts` đọc file, test dùng `node:path`, `apps/api` dùng `Date`) vẫn xanh.

**Các mức kiểm:**

- [ ] L0 Static: `make lint`, `make typecheck`.
- [ ] L1 Unit: `make test` (gồm `purity.test.ts`); `node --test tools/lint/` (ca vi phạm + ca không được báo).
- [ ] L2: không có server/API liên quan. Bậc tương đương là chạy `eslint` CLI thật trên repo thật với vi phạm cố ý trong file thật (kịch bản 1–5). Ghi rõ trong report.
- [ ] L2 Eval: không áp dụng (không đổi prompt/model/rule/ngưỡng).
- [ ] L3, L4: không áp dụng.

**Kịch bản sẽ chạy** (mỗi kịch bản: thêm vi phạm → `make lint` → dán dòng lỗi → gỡ → `make lint` xanh; `git diff --stat` sạch sau khi gỡ):

| # | Kịch bản | Vi phạm cố ý | Kết quả quan sát được kỳ vọng |
| --- | --- | --- | --- |
| 1 | A3/A5 đồng hồ | `Date.now()` trong `packages/rules/src/engine.ts` | `no-restricted-syntax` với message `A5: ...` |
| 2 | A3 I/O | `import "node:fs"` trong `engine.ts` | `no-restricted-imports` với message `A3: ...` |
| 3 | A5 ngoài rules | `new Date()` trong `packages/contracts/src/common.ts` | `no-restricted-syntax` `A5: ...` |
| 4 | A9 không lý do | `// eslint-disable-next-line no-console` không có `-- lý do` trong `engine.ts` | `eslint-comments/require-description` |
| 5 | A9 thừa | `// eslint-disable-next-line no-debugger -- thử` trên dòng không có debugger | `Unused eslint-disable directive` (error) |
| 6 | Ghi đè selector | `pnpm exec eslint --print-config packages/rules/src/engine.ts \| jq '.rules["no-restricted-syntax"]'` | có cả selector `Date` (A5) và `Math.random`, `console` (A3) |
| 7 | Không báo nhầm | `make lint` trên code thật | xanh, không có cảnh báo mới |

**Test mới phải đỏ trên code cũ:**

- `tools/lint/guardrails.test.mjs`: chạy trên `eslint.config.mjs` **chưa** có 3 block mới → các ca vi phạm đỏ. Ca Math.random/console đỏ cho tới khi Liam viết selector.
- `purity.test.ts`:
  - ca freeze: tạm sửa `route()` thành `results.sort(...)` (sửa input) → đỏ.
  - ca fake timers: tạm thêm `Date.now() % 2` vào điều kiện `route()` → đỏ.
  - Gỡ ngay sau đó; ghi lệnh + output vào report.

**Thay đổi feature map:** không có (không có tính năng người dùng mới).

**Những gì sẽ KHÔNG kiểm, và lý do:**

- `evaluateRules` thuần lúc chạy: engine chưa có code, 3 ca để `it.todo`.
- `globalThis.process` / truy cập gián tiếp: ngoài phạm vi (câu hỏi 3).
- Hook `PostToolUse` chạy lint sau mỗi lần sửa: Phase 1 của quy trình verify, duyệt riêng.

# Guardrails

> Rule mềm (file này, CLAUDE.md, skill) có thể bị quên.
> Rule cứng (type, lint, CI, script, hook) thì không.
> File này là quy trình biến loại thứ nhất thành loại thứ hai.

## Các lớp cưỡng chế (mạnh → yếu)

1. **Kiến trúc:** mỗi việc chỉ có một chỗ / một cách làm hiển nhiên
   (thư mục theo feature, ranh giới có type, schema dùng chung). Agent chép pattern có sẵn,
   nên pattern có sẵn phải là pattern đúng.
2. **Compiler / type:** TS strict, Zod ở mọi ranh giới, không `any`.
3. **Lint + boundary check:** làm build đỏ khi gặp pattern đã biết là sai hoặc import trái phép.
4. **Hook:** hook của Claude Code chạy check L0 sau mỗi lần sửa, ngay trong vòng làm việc.
5. **CI:** cùng các check đó, cộng test và bộ fixture, chặn merge.
6. **Skill / CLAUDE.md / file này:** hướng dẫn. Có ích, nhưng không bao giờ là tuyến phòng thủ duy nhất.

Mục tiêu: mọi rule quan trọng nằm ở lớp 1–5. Lớp 6 giải thích *vì sao*.

## Quy trình: lỗi bị chỉnh lại → rule cứng

Khi Liam phải chỉnh lại một lỗi Claude mắc (hoặc Claude tự phát hiện mình mắc lại một kiểu lỗi):

1. **Lần đầu:** sửa. Thêm một dòng vào **Watchlist** bên dưới.
2. **Lần thứ hai (cùng kiểu):** nâng cấp, đề xuất rule cứng thành một thay đổi nhỏ riêng:
   - lint rule (`no-restricted-imports`, `no-restricted-syntax`, rule tự viết), hoặc
   - boundary rule (dependency-cruiser / eslint-plugin-boundaries), hoặc
   - đổi type (làm cho trạng thái sai không biểu diễn được), hoặc
   - script / CI check, hoặc
   - đổi cấu trúc (chuyển code sao cho import sai là không thể).
3. Đề xuất phải có: rule, một ví dụ nó bắt được, bằng chứng nó không báo nhầm trên
   codebase hiện tại (hoặc danh sách chỗ nó báo + cách sửa).
4. Merge xong thì chuyển dòng đó từ **Watchlist** sang **Active**, kèm cơ chế cưỡng chế.

Comment khi review là dấu hiệu: người viết "đừng làm X" trên một thay đổi thì mặc định
đó là một dòng mới cho Watchlist.

## Danh sách luật

Trạng thái: ✅ đã có gờ · 🟡 có một phần · ⏳ chờ code tồn tại (ghi plan sẽ làm)

| # | Luật | Gờ (cơ chế cứng) | Trạng thái | Làm ở |
|---|---|---|---|---|
| A1 | Không có dữ liệu cá nhân/y tế thật trong fixture, log, screenshot, prompt | `.gitignore` (`real-docs/`, `data/`, `.env`); script `check-fixtures` trong CI | 🟡 | script: P2 (khi `tools/synth` sinh dữ liệu) |
| A2 | Mọi input từ ngoài parse bằng Zod trước khi dùng | `ZodValidationPipe`, `RulesConfig` khi khởi động; lint cấm `JSON.parse` ngoài helper `parseWith(schema, text)` | 🟡 | lint: Bước 6 |
| A3 | Rule engine là hàm thuần: không I/O, không framework, không đồng hồ, không `Math.random`, không `console` | `eslint.config.mjs` block "A3" (`no-restricted-imports`/`-globals`, `no-restricted-syntax` = `A5_NO_DATE` + `A3_PURE`; trừ `config.ts`, test); `packages/rules/src/purity.test.ts` (`route()`; `evaluateRules` là `it.todo` tới khi CPR rule có code); `tools/lint/guardrails.test.mjs` | ✅ | plan 12a |
| A4 | Chỉ `auto_approve` khi mọi rule `block` qua | `packages/rules/src/route.invariants.test.ts` (3 bất biến trên mọi danh sách dài 0–4); eval `falseApproveRate` chờ P2 | 🟡 | test: plan 12b · `route([])`: plan 12c · eval: P2 |
| A5 | Ngày lịch là `YYYY-MM-DD`, không dùng `Date` (chỉ `packages/*`; `apps/*` cần timestamp thật) | contract `IsoDate`; `eslint.config.mjs` block "A5" (`A5_NO_DATE`: `new Date`, `Date()`, `Date.now`; trừ test, `config.ts`) | ✅ | plan 12a |
| A6 | Document đã qua `processing` phải có `versions` | DB CHECK `documents_versions_after_processing` | ⏳ | Bước 4 |
| A7 | Document `failed` phải có `error` | DB CHECK `documents_failed_has_error` | ⏳ | Bước 4 |
| A8 | Không tự đổi vùng kiến trúc (contracts, schema DB, `config/rules`, prompt, lint config, `docs/agent`) | branch protection (CI xanh + Liam duyệt); CI cảnh báo khi PR chạm các đường dẫn này | ⏳ | Bước 5 |
| A9 | `eslint-disable` phải có lý do, không có disable thừa | `eslint.config.mjs` block "A9" (`comments.recommended` + `require-description`, `linterOptions.reportUnusedDisableDirectives: "error"`) | ✅ | plan 12a |
| A10 | LLM không bao giờ quyết định duyệt | module LLM chỉ trả `Extraction`; lint cấm module LLM import nơi ghi status / `route()` | ⏳ | plan 12 |
| A11 | Không tự từ chối; trạng thái chỉ đổi qua một nơi | hàm ghi status duy nhất + bảng transition (`rejected` bắt buộc `reviewerId`); lint cấm `.set({ status })` ngoài file đó | ⏳ | plan 12 |
| A12 | Prompt nằm trong file có version | một hàm `loadPrompt(name, version)`; test đối chiếu prompt dùng trong code với file | ⏳ | plan có LLM đầu tiên (P1) |

Luật **giữ ở lớp mềm** (cần phán đoán, máy không bắt được): chế độ dạy, giải thích trước khi code,
chọn task tiếp theo, đánh giá trade-off. Những luật này ở lại CLAUDE.md.


## Watchlist (đã thấy, chưa cưỡng chế)

| Ngày | Sai ở đâu | Số lần gặp | Rule cứng đề xuất |
|---|---|---|---|
| 2026-11-04 | Mã rule trùng trong một lần chấm: `route()` giữ nguyên, `reasons` lặp code. Đây là lỗi config, không lọc ở `route()` | 1 | chặn ở `RulesConfig` khi nạp (mã rule duy nhất), app không khởi động: plan 12c |

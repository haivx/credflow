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
| A2 | Mọi input từ ngoài parse bằng Zod trước khi dùng (bảng cửa dữ liệu: `docs/plans/12g-zod-boundaries.md`) | Cửa đang có: `ZodValidationPipe` (body, query, `@Param`), cookie, env, `RulesConfig`. Job data: `ProcessDocumentJob.safeParse`, worker khai `Job<unknown>` để compiler buộc parse (`apps/api/src/worker/document-processor.ts`, `test/worker.int-spec.ts`). `parseJson(schema, text)` (`packages/contracts/src/parse-json.ts`): lỗi không kèm input/`cause` (A14). Lint trong `eslint.config.mjs`: 5 rule `no-unsafe-*` ở `apps/api/src`, `packages/*/src`; `no-unsafe-type-assertion` (trừ test); `A2_NO_JSON_PARSE` ở `apps/*`, `packages/*/src`, `eval/src`, `tools/synth/src` (miễn helper, test, `tools/lint`). **Lint không thấy được:** `Job<T>`, `Worker<T>` và `jsonb` có `$type<>()` chỉ khai báo kiểu; `const { parse } = JSON`. Web, eval, synth chưa có typed lint | 🟡 cửa đang có đã gờ; output LLM, DB `jsonb`, golden set chờ code | plan 12g · job data: plan 12 · `jsonb`: khi có code đọc cột kết quả · LLM: plan LLM · golden: P2 · web: plan web |
| A3 | Rule engine là hàm thuần: không I/O, không framework, không đồng hồ, không `Math.random`, không `console` | `eslint.config.mjs` block "A3" (`no-restricted-imports`/`-globals`, `no-restricted-syntax` = `A5_NO_DATE` + `A3_PURE`; trừ `config.ts`, test); `packages/rules/src/purity.test.ts` (`route()`; `evaluateRules` là `it.todo` tới khi CPR rule có code); `tools/lint/guardrails.test.mjs` | ✅ | plan 12a |
| A4 | Chỉ `auto_approve` khi mọi rule `block` qua | `packages/rules/src/route.invariants.test.ts` (3 bất biến trên mọi danh sách dài 0–4; `route([])` → `needs_review` + `NO_RULES_EVALUATED`); `assertRulesReady` (mỗi loại giấy được yêu cầu có rule block, mã không trùng; worker gọi lúc khởi động, `apps/api/src/rules/rules-config.provider.ts`); eval `falseApproveRate` chờ P2 | 🟡 | test: plan 12b, 12c · eval: P2 |
| A5 | Ngày lịch là `YYYY-MM-DD`, không dùng `Date` (chỉ `packages/*`; `apps/*` cần timestamp thật) | contract `IsoDate`; `eslint.config.mjs` block "A5" (`A5_NO_DATE`: `new Date`, `Date()`, `Date.now`; trừ test, `config.ts`) | ✅ | plan 12a |
| A6 | Document đã qua `processing` phải có `versions` | DB CHECK `documents_versions_after_processing` (migration 0003); `test/db-constraints.int-spec.ts`. Worker ghi `versions` khi vào `processing` (`document-processor.ts`, `test/worker.int-spec.ts`) | ✅ | plan 12d, 12 |
| A7 | Document `failed` phải có `error` | DB CHECK `documents_failed_has_error` (migration 0003); `test/db-constraints.int-spec.ts` | ✅ | plan 12d |
| A13 | Trạng thái kết quả không thể có thì DB từ chối: `auto_approved` cần routing auto không lý do (C1) + rule đã chấm, không rule block trượt (C2); `extracted`/`auto_approved` có classification + extraction (C4); `uploaded` không mang kết quả cũ, xử lý lại đi sang `processing` (C5). **Đổi `RuleResult`/`RoutingDecision` → xem lại CHECK C1, C2** | DB CHECK `documents_auto_approved_routing`, `documents_auto_approved_no_block_fail`, `documents_extracted_has_result`, `documents_uploaded_is_clean`; test dựng dữ liệu từ `packages/contracts/fixtures` (đổi contract → test đỏ). 23514 → 500 INTERNAL, log có `code`/`constraint`/`table`, không có `detail` (F1) | ✅ | plan 12d |
| A8 | Không tự đổi vùng kiến trúc (danh sách: `docs/agent/architecture-zones.txt`; thứ gì tắt được guardrail thì thuộc guardrail) | **Cổng chính: plan khai trước vùng sẽ chạm (mục "Vùng kiến trúc bị chạm") + CI cảnh báo (so diff, thấy mọi thay đổi bất kể sửa bằng gì) + Liam tự merge.** Ba lớp: (1) GitHub ruleset `Protect main branch`: bắt buộc PR + check `check` và `architecture-zones` xanh (script hỏng cũng chặn merge), cấm force push và xoá nhánh, không bypass, không required approvals; (2) `.claude/settings.json`: deny merge (cả `gh api` REST và `gh api graphql`), push `main`, force, xoá nhánh, `gh api` gỡ ruleset. **`ask` chỉ còn `Edit(/.claude/settings.json)`, `Edit(/.claude/hooks/**)`, là thứ tắt được cổng; không phải cổng cho các vùng khác** (plan 12h: ask trên mọi vùng trùng với việc đã duyệt plan, và lách được bằng script). Deny chỉ chặn lệnh viết đúng dạng, `Edit` không chặn script tự mở file, nên CLAUDE.md yêu cầu sửa 2 đường dẫn này bằng tool (rule mềm); (3) job CI `architecture-zones` (`tools/lint/architecture-zones.sh`): `::warning` + job summary, không fail. Test `tools/lint/architecture-zones.test.mjs` giữ `ask` đúng bằng 2 đường dẫn và `deny` đủ các đường. `:*` ở cuối rule là prefix kiểu cũ, không phải wildcard: `*` đứng trước nó thành ký tự thật và rule mất tác dụng (plan 12j), nên xoá nhánh bằng dấu hai chấm viết là `Bash(git push * :**)`; test cũng chặn rule `Bash(...)` trộn hai cú pháp này, nhưng chỉ kiểm chuỗi, không chạy Claude Code. **Đánh đổi:** sửa vùng khác không còn prompt lúc sửa, kể cả contract, schema, rule, prompt; rule "không tự ý đổi" dựa vào plan, cảnh báo CI và mắt owner. Giới hạn: PR sửa chính job có thể làm mất cảnh báo, nên diff `.github/**` phải đọc bằng mắt | ✅ (đã kiểm trên `main`; lỗ script đo được, xem Watchlist) | plan 12f, 12h |
| A9 | `eslint-disable` phải có lý do, không có disable thừa | `eslint.config.mjs` block "A9" (`comments.recommended` + `require-description`, `linterOptions.reportUnusedDisableDirectives: "error"`) | ✅ | plan 12a |
| A10 | LLM không bao giờ quyết định duyệt | `apps/api/src/llm/` chỉ trả `Classification`, `Extraction`, không có tool. Lint (`eslint.config.mjs`, `tools/lint/guardrails.test.mjs`) cấm thư mục này import `@credflow/rules`, `documents/`, `db/`, `pipeline/`, `worker/`, và cấm import SDK LLM ở ngoài thư mục này | ✅ | plan 14 |
| A11 | Không tự từ chối; trạng thái chỉ đổi qua một nơi | `assertTransition` + bảng transition (`apps/api/src/documents/state-machine.ts`; `approved`, `rejected`, `reupload_requested` bắt buộc `reviewerId`; spec phủ mọi cặp trạng thái). `DocumentStatusService.transition` là nơi duy nhất ghi status, `WHERE status = from`. Lint `A11_NO_STATUS_WRITE` cấm `.set({ status })`, `.values({ status })` ở `apps/api/src` ngoài file đó. **Lint không bắt được** `const patch = { status }; .set(patch)` | 🟡 lint có lỗ đã biết | plan 12 |
| A12 | Prompt nằm trong file có version | `loadPrompt(name, version)` (`apps/api/src/llm/prompts.ts`); `PROMPTS` là danh sách đang dùng, `prompts.spec.ts` đối chiếu với file; worker nạp lúc khởi động, thiếu file thì không chạy. **Lint không chặn** prompt viết inline | 🟡 | plan 14 |
| A14 | Log lỗi DB chỉ gồm `PgErrorInfo` + SQL dạng `$1` + stack frames; không có message gốc, `params`, `detail`, `where`. **Giả định:** mọi query đều có tham số, nên SQL trong log không chứa giá trị (cũng là cơ sở chống SQL injection) | **Gờ chính:** `formatErrorForLog` (`apps/api/src/common/pg-error.ts`) + `apps/api/test/error-log.int-spec.ts` (lỗi thật, kiểm chuỗi thật ghi ra). **Lớp phụ (lint, `eslint.config.mjs`, block "A14"):** cấm `.stack` (miễn trừ `pg-error.ts`), cấm `sql.raw` (miễn trừ `schema.ts`: DDL không nhận `$1`, chỉ ghép hằng số từ contracts), `no-console` ở `apps/api/src` (trừ spec; `scripts/` nằm ngoài). Lint không chặn được `logger.error(err.message)` | ✅ | plan 12e |
| A15 | Trước khi báo PR sẵn sàng, chạy `pr-reviewer` và dán kết luận vào PR. Reviewer chỉ đọc | Subagent `.claude/agents/pr-reviewer.md`; hook `.claude/hooks/pr-reviewer-bash.mjs` giới hạn Bash theo danh sách cho phép; `tools/lint/pr-reviewer-bash.test.mjs`. **Bước chạy reviewer vẫn là rule mềm** (CLAUDE.md), CI không kiểm. Reviewer cũng là Claude nên "OK" không phải bằng chứng độc lập; lệnh `make` chạy script trong repo nên diff `Makefile` phải đọc bằng mắt. **Tạm tắt từ 2026-11-05 theo quyết định của Liam (ưu tiên ship).** Hook trên `main` còn 3 lỗi đã tái hiện (`.verify/reports/2026-11-05-12i-pr-reviewer.md`, chỉ có ở máy Claude đã chạy); bản vá ở nhánh `fix/12k-pr-reviewer-hook`, chưa merge | ⏸️ | plan 12i |

Luật **giữ ở lớp mềm** (cần phán đoán, máy không bắt được): mục "Quyết định đáng nhớ" của plan,
chọn task tiếp theo, đánh giá trade-off. Những luật này ở lại CLAUDE.md.


## Watchlist (đã thấy, chưa cưỡng chế)

| Ngày | Sai ở đâu | Số lần gặp | Rule cứng đề xuất |
|---|---|---|---|
| 2026-11-04 | C3 (`needs_review` → `routing` NOT NULL) chưa bật: ca LLM lỗi → `needs_review` chưa có mã trong `RuleCode` | 0 | bật CHECK `documents_needs_review_routing` khi contract có mã cho ca LLM lỗi → `needs_review` |
| 2026-11-04 | Kiểm chứng plan 12d: lệnh shell chạy tiếp dù bước trước lỗi (zsh không tách `$P`, không có `set -e`), nên query vi phạm không chạy mà `make db-migrate` vẫn chạy | 1 | script trong `.claude/skills/verify/scripts` dùng bash + `set -euo pipefail`, thêm test kiểm mọi script ở đó. **Lưu ý:** lần này là lệnh gõ trực tiếp, không phải script, nên rule này một mình chưa chặn được; bước một chiều như migrate phải đi qua script. Phương án thêm: đưa bước kiểm vào trong `make db-migrate`, **chờ lần gặp thứ hai mới làm** |
| 2026-11-04 | Lỗ đã đo được (plan 12f, KB7), chưa gây sự cố: trong auto mode, lệnh Bash (`python3`, `sed -i`, `cd` + `touch`) chạy trên file vùng kiến trúc mà không có prompt `ask` nào bị từ chối. Từ plan 12h, tool Edit cũng chỉ có prompt ở `.claude/settings.json`, `.claude/hooks/**`. Với 2 đường dẫn này vẫn dựa vào rule mềm trong CLAUDE.md và CI warning | 0 | Khi script sửa 2 đường dẫn này mà plan không nói trước → làm hook `PreToolUse` B (plan 12f). Phải kiểm: có hỏi trong auto mode không, có hỏi thừa không |
| 2026-11-05 | PR chạm vùng kiến trúc mà plan không khai trước (chưa xảy ra; `ask` trên các vùng đã bỏ ở plan 12h nên không còn prompt nào chặn lúc sửa) | 0 | Nếu xảy ra, cân nhắc check tự động so cảnh báo CI `architecture-zones` với mục "Vùng kiến trúc bị chạm" của plan |

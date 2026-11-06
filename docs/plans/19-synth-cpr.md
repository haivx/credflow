# 19 · Sinh thẻ CPR giả lập (synth) và baseline trên tập lớn hơn

Phase: P2 · Trạng thái: Đã duyệt · Ngày: 2026-11-06

## Mục tiêu

`make synth` hiện chỉ in "chưa hiện thực", và golden set mới có 6 ca, không có holdout. Làm xong thì `make synth SEED=1` sinh 40 thẻ CPR giả lập (4 bố cục, có nhiễu) kèm `cases.json`, sinh lại đúng như cũ khi cùng seed; `make eval` chạy hard-cases + synth, ra baseline trên 36 ca dev (6 hard-cases + 30 synth) và lần đầu có 10 ca holdout.

## Phạm vi

- **Trong:** 4 template CPR; random có seed; bảng kịch bản và đáp án theo chính sách; nhiễu bằng CSS; render bằng Playwright (PNG, JPEG, PDF); `cases.json`; eval đọc nhiều file ca; baseline mới.
- **Ngoài:**
  - Loại giấy khác CPR (P3, P5); ca khó làm tay thêm (roadmap đòi 10, có 6).
  - Chạy synth trong CI (cần tải Chromium; CI chỉ chạy unit test của generator).
  - Nhiều trang, chữ viết tay: tag có sẵn nhưng chưa sinh.
  - Đổi prompt, rule, ngưỡng.

## Quyết định của Liam (2026-11-06)

1. Render bằng `playwright` (Chromium), devDependency của `tools/synth`.
2. Nhiễu bằng CSS trong trình duyệt + chụp JPEG chất lượng thấp; không thêm thư viện ảnh.
3. 40 ca: 30 dev, 10 holdout.
4. Đáp án `decision` đặt theo chính sách và sự thật của kịch bản, không chạy rule engine.
5. `make eval` mặc định chạy hard-cases + synth nếu đã sinh; report có cột nguồn ca.

## Cần anh duyệt riêng

| # | Vấn đề | Đề xuất |
| --- | --- | --- |
| 1 | "Cùng seed, cùng dữ liệu" kiểm thế nào | Kiểm chặt `cases.json` và HTML đã điền (giống từng byte). Ảnh: giống từng byte trên cùng máy, cùng bản Chromium; khác máy có thể khác vì font. Test tự động chỉ so `cases.json` + HTML |
| 2 | Thẻ chỉ in "Valid through 03/2028" (tháng/năm) | Đáp án `needs_review` (giống ca 03 hard-cases), không so `expirationDate` vì đáp án đúng phụ thuộc cách hiểu "hết tháng" |
| 3 | Thẻ chỉ in câu hiệu lực ("Valid 2 years from completion") | Đáp án `auto_approve` nếu còn hạn tính theo câu đó, đúng người, tổ chức được chấp nhận; so `validityText`, `expirationDate` phải là `null` |
| 4 | Ảnh nhiễu nặng | Đáp án vẫn theo sự thật của thẻ; hệ thống chuyển người duyệt vì đọc không chắc thì chỉ làm giảm `autoApproveRate`, không phải duyệt nhầm |
| 5 | Dùng chung hàm ngày | Export `addMonths`, `addDays` từ `packages/rules` (đang có, chưa export) cho synth dùng; không viết lại |

## Thiết kế

### Bố cục (`tools/synth/templates/cpr/`)

| Bố cục | Dạng | Ngày | Hạn | Xuất |
| --- | --- | --- | --- | --- |
| `renewal-bar` | thẻ ngang, dải màu trên dưới, theo `docs/research/layout-notes.md` mẫu 1 | M/D/YYYY không số 0 | "Renewal Date" in sẵn | PNG |
| `certificate` | giấy chứng nhận A4, đoạn văn "This certifies that…" | "March 14, 2026" | "Expires" in sẵn | PDF |
| `wallet-validity` | thẻ khổ ví, hai cột | "Issued 2026-03-14" | chỉ câu "Valid 2 years from the date of completion." | PNG/JPEG |
| `valid-through` | thẻ dọc nhỏ | "Completed 03/14/2026" | "Valid through 03/2028" | PNG/JPEG |

Mọi template có watermark `SAMPLE` cố định trong HTML (không phụ thuộc dữ liệu). Placeholder `{{field}}` được escape HTML khi điền.

### Random có seed (`src/rng.ts`)

`mulberry32(seed)` (khoảng 10 dòng) + `pick`, `int`, `shuffle`. Không dùng `Math.random()` ở đâu trong generator (có test quét). Thứ tự gọi random cố định nên cùng seed → cùng chuỗi kịch bản.

### Bảng kịch bản (40 ca; `asOf` cố định `2026-11-06`)

| Kịch bản | Số ca | Tag | `decision` |
| --- | --- | --- | --- |
| Còn hạn, đúng tên, tổ chức chấp nhận, ảnh sạch | 8 | `clean` | `auto_approve` |
| Như trên, có nhiễu xoay / mờ / chụp lệch | 3 / 3 / 3 | `rotated` / `blurred` / `skewed_photo` | `auto_approve` |
| Còn ≤ 30 ngày (EXPIRING_SOON là info) | 2 | `clean` | `auto_approve` |
| Đã hết hạn | 4 | `expired` | `needs_review` |
| Tổ chức hư cấu không có trong `acceptedIssuers` | 4 | `issuer_not_accepted` | `needs_review` |
| Biến thể tên rule chấp nhận ("LAST, FIRST", alias, tên đệm viết tắt) | 3 | `name_variant` | `auto_approve` |
| Biến thể tên rule không chấp nhận ("J. Ostrowe", hậu tố bị bỏ) | 2 | `name_variant` | `needs_review` |
| Tên của người khác | 2 | `name_variant` | `needs_review` |
| Chỉ câu hiệu lực, còn hạn (`wallet-validity`) | 2 | `no_printed_expiry` | `auto_approve` |
| Chỉ tháng/năm (`valid-through`) | 2 | `no_printed_expiry` | `needs_review` |
| Ngày D/M đều ≤ 12 (prompt để trống) | 2 | `date_format_ambiguous` | `needs_review` |

Bố cục chia đều theo vòng cho các kịch bản không ràng buộc bố cục. Split: xáo 40 ca bằng seed rồi lấy lần lượt từng kịch bản một ca cho tới đủ 10 ca `holdout`, nên holdout phủ 10 trong 13 kịch bản và có cả hai loại `decision`. `staff` sinh hư cấu, nhúng vào `GoldenCase` (eval không cần DB). Tên người và tổ chức lấy từ danh sách hư cấu cố định trong `src/names.ts`; tổ chức "chấp nhận" lấy từ `config/rules/default.yaml`.

`decision` tính bằng hàm `expectedDecision(scenario)` trong `src/policy.ts`, viết theo bảng trên, **không import rule engine** (có test kiểm import).

### Đáp án trường

- Ngày: `YYYY-MM-DD` của sự thật; `expirationDate` của `valid-through` không đưa vào đáp án; của `wallet-validity` là `null`.
- `holderName`: đúng chuỗi in trên thẻ (có thể là "OSTROWE, MAREN"); eval so bằng `nameMatches` với chuỗi đó.
- `issuerName`, `courseType`, `cardNumber`, `validityText`: đúng chuỗi in.
- Ca `date_format_ambiguous`: `completionDate` đáp án là `null` (theo prompt).

### Render (`src/render.ts`)

Playwright `chromium.launch()` một lần, một page cho mỗi ca: `setContent(html)`, viewport theo bố cục, nhiễu gói trong `<div>` có `transform: rotate(θ)`, `filter: blur(r)`, `perspective` + `rotateX/Y`; tham số nhiễu lấy từ rng. Xuất PNG, JPEG (`quality` 40–70) hoặc `page.pdf()` cho `certificate`.

### CLI (`src/generate.ts`)

`make synth SEED=1 [COUNT=40]` → xoá rồi ghi lại `data/synth/cpr/` (chỉ thư mục này): `synth-cpr-0001.png|jpg|pdf`, `synth-cpr-0001.html` (HTML đã điền, để kiểm và gỡ lỗi), `cases.json`. In tóm tắt số ca theo kịch bản và split.

### Eval

- `--cases` nhận nhiều lần; mặc định `eval/hard-cases/cpr/cases.json` + `data/synth/cpr/cases.json` nếu có.
- Report thêm cột "Nguồn" (`hard-cases` / `synth`, suy từ tiền tố id `synth-`), và bảng metric riêng theo nguồn. Không đổi contract.
- `make eval ARGS="--split holdout"` chạy 10 ca holdout.

## Thay đổi

| File | Thay đổi |
| --- | --- |
| `tools/synth/package.json` | `playwright`, `vitest`, `@credflow/rules`; script `test` |
| `tools/synth/src/{rng,names,scenarios,policy,fill,render,generate}.ts` | mới |
| `tools/synth/src/*.test.ts`, `tools/synth/vitest.config.ts` | unit test generator (không cần trình duyệt) |
| `tools/synth/templates/cpr/*.html` | 4 template |
| `tools/synth/README.md` | cách chạy, cài Chromium |
| `packages/rules/src/index.ts` | export `addMonths`, `addDays` |
| `apps/api/scripts/eval.ts`, `apps/api/src/eval/report.ts` (+ spec) | nhiều file ca, cột nguồn |
| `Makefile`, `CLAUDE.md` | `make synth SEED= COUNT=`, mô tả |
| `pnpm-lock.yaml` | dependency mới |
| `eval/README.md`, `.claude/skills/verify/FEATURE_MAP.md`, `docs/STATUS.md` | cách chạy, baseline mới |

## Vùng kiến trúc bị chạm

- `**/package.json` (`tools/synth`), `**/vitest*.config.ts` (`tools/synth/vitest.config.ts` mới).
- `Makefile`, `CLAUDE.md`, `.claude/skills/verify/**`.
- Không chạm contract, prompt, `config/rules/**`, DB, `eslint.config.mjs`.

## Contract / config / prompt bị ảnh hưởng

Không. Dùng `GoldenCase` đã chốt ở plan 18; tag dùng tập `CaseTag` có sẵn.

## Quyết định đáng nhớ

- **Chỗ khó nhất:** đáp án phải độc lập với hệ thống được đo. `policy.ts` viết lại chính sách từ bảng kịch bản, không gọi `evaluateRules`; nếu rule và policy cùng sai một chỗ thì eval không bắt được, nên bảng kịch bản là thứ anh duyệt.
- **Đã loại:** `sharp`/ImageMagick cho nhiễu: thêm thư viện native khó cài; CSS + JPEG trong Chromium đủ cho xoay, mờ, lệch, nén.
- **Đã loại:** Chrome cài sẵn trên máy: không tái lập được trên máy khác.
- **Khi nào hỏng:** nâng bản Playwright/Chromium hoặc đổi font hệ thống → ảnh khác byte, cache LLM theo sha256 trượt hết, eval gọi lại LLM (khoảng $0.03). Ghi trong README.

## Tiêu chí xong

- [ ] `make synth SEED=1` hai lần → `cases.json` và HTML giống từng byte; ảnh giống từng byte trên cùng máy.
- [ ] `SEED=2` cho bộ khác.
- [ ] 40 ca đúng bảng kịch bản, 30 dev / 10 holdout; mọi file có watermark SAMPLE.
- [ ] `make eval` chạy 36 ca dev (6 hard-cases + 30 synth), report có cột nguồn; baseline mới ghi vào STATUS; `--split holdout` chạy 10 ca.
- [ ] `make lint`, `make typecheck`, `make test`, `make test-int` xanh.
- [ ] Evidence report có trong PR.

## Rủi ro / câu hỏi

1. **Tải Chromium:** `pnpm --filter @credflow/synth exec playwright install chromium` khoảng 150 MB, một lần. `make synth` báo rõ nếu chưa cài.
2. **Synth quá dễ hoặc quá khó so với thẻ thật:** chưa có số liệu giấy thật; tách metric theo nguồn để không lẫn với hard-cases.
3. **Chi phí:** eval lần đầu trên synth khoảng 70–80 lượt gọi, khoảng $0.03.

## Verification plan

**Mức rủi ro:** T2. Không đổi hệ thống đang chạy; dữ liệu và đáp án quyết định metric các thay đổi T3 sau này, nên đáp án được kiểm bằng test riêng và xem tay.

**Hành vi kỳ vọng:**

- Một lệnh sinh lại đúng bộ giấy giả lập; đổi seed ra bộ khác.
- Đáp án của mỗi ca khớp chính sách trong bảng kịch bản.
- Eval cho số liệu riêng cho synth và cho hard-cases.

**Các mức kiểm:**

- [ ] L0: `make lint`, `make typecheck` (gồm `tools/synth`).
- [ ] L1: `make test`: rng (cùng seed cùng chuỗi), bảng kịch bản (đếm theo tag, split), `policy` (từng kịch bản), `fill` (escape HTML, đủ placeholder, watermark), quét `Math.random`, quét import rule engine trong `policy.ts`.
- [ ] L2: `make synth SEED=1` hai lần + `SEED=2`, so sha256 từng file; xem tay 4 ảnh (mỗi bố cục một) và 3 ảnh nhiễu; `make eval` thật, đối chiếu tay các ca duyệt nhầm (nếu có) và vài ca `needs_review`.
- [ ] L2 Eval: baseline mới (synth dev, synth holdout, hard-cases), so với baseline 6 ca.
- [ ] L3, L4: không áp dụng.

**Kịch bản:**

| # | Kịch bản | Kết quả kỳ vọng |
| --- | --- | --- |
| 1 | rng: seed 1 hai lần, seed 2 | chuỗi 1000 số giống nhau; khác nhau |
| 2 | Bảng kịch bản với seed 1 | đúng số ca theo bảng, 30/10 split, holdout có cả `auto_approve` và `needs_review`, không kịch bản nào có quá 1 ca holdout |
| 3 | `policy` từng kịch bản | đúng cột `decision` của bảng |
| 4 | `fill`: tên có `<script>`, thiếu placeholder | được escape; ném lỗi |
| 5 | Quét mã nguồn | không có `Math.random`; `policy.ts` không import `@credflow/rules` engine |
| 6 | `make synth SEED=1` ×2 | sha256 mọi file giống nhau |
| 7 | `make synth SEED=2` | `cases.json` khác |
| 8 | Xem tay ảnh | đủ trường, chữ đọc được, watermark, nhiễu thấy rõ |
| 9 | Chưa cài Chromium | exit 1, câu hướng dẫn cài |
| 10 | `make eval` (thật) | chạy hết, report có cột nguồn và metric theo nguồn |
| 11 | `make eval` lần hai | 0 lượt gọi LLM |
| 12 | `make eval ARGS="--split holdout"` | 10 ca synth holdout |

**Test mới phải đỏ trước:** viết test cho rng, kịch bản, policy, fill trước code; cho thấy đỏ (module chưa có), và phá `policy` (một kịch bản trả sai decision) → test đỏ.

**Thay đổi feature map:** mục mới "Synth"; mục "Eval" thêm nhiều nguồn.

**Những gì sẽ KHÔNG kiểm, và lý do:**

- Ảnh giống byte giữa hai máy khác nhau: phụ thuộc font, đã ghi là giới hạn.
- Synth có giống giấy thật không: chưa có số liệu giấy thật (data policy).

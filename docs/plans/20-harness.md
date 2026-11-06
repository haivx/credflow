# 20 · Harness: script verify, eval gate trong CI

Phase: P2 · Trạng thái: Đã duyệt · Ngày: 2026-11-06

## Mục tiêu

Hai việc đang làm tay ở mọi plan:

1. **Kiểm chứng:** plan 16, 17, 18, 19 đều tự dựng lại cách bật app, đăng nhập, gọi API, chụp UI và dọn dữ liệu. Skill `verify` ghi các script `up.sh`, `api.sh`, `ui.ts` nhưng chưa có.
2. **Chặn duyệt nhầm:** `make eval` cần khoá API và tốn tiền nên chỉ chạy tay; không có gì tự chặn một PR làm `falseApproveRate` tăng.

Làm xong thì skill `verify` có script chạy được, và CI có bước `eval-ci` chấm lại rule trên output LLM đã ghi (0 lời gọi LLM, không cần khoá), fail khi số ca duyệt nhầm trên dev vượt mức cho phép.

## Phạm vi

- **Trong:**
  - Script `verify`: `up.sh`, `down.sh` (có `--clean`), `api.sh`, `ui.ts`; sửa `SKILL.md` bỏ phần "chưa có".
  - Eval: `--record` (ghi output LLM của ca dev vào `eval/recorded/`), `--recorded` (chạy từ đó, không gọi LLM), `--no-save` (chạy thử không ghi run/report), cổng chặn theo `eval/gate.json`.
  - Synth: `--cases-only` (sinh `cases.json` + HTML, không render, không cần Chromium) để CI có đúng bộ ca synth.
  - CI: bước `make eval-ci`.
  - `.gitignore`: `.playwright-mcp/`.
- **Ngoài:**
  - Sửa lỗi duyệt nhầm ở ngưỡng 0.85: plan 21 (T3). Plan này chỉ khoá mức hiện tại để không tệ thêm.
  - E2E UI tự động trong CI: `ui.ts` dùng khi verify, chưa chạy trong CI.
  - `pr-reviewer`: vẫn tắt theo quyết định của Liam.
  - Script `seed.ts`, `fixtures.ts` mà SKILL nhắc: `make db-seed` và `make synth` đã đủ; xoá khỏi SKILL.

## Cần anh duyệt riêng

| # | Vấn đề | Đề xuất |
| --- | --- | --- |
| 1 | Mức chặn của cổng eval | `eval/gate.json` `{ "maxFalseApproveCount": 2 }` trên split dev (đúng mức hiện tại). Vượt → CI đỏ. Hạ mức là sửa file này trong PR (plan 21 hạ về 0); nâng mức cũng phải sửa file, nên luôn thấy trong diff |
| 2 | Output ghi sẵn có thể cũ | Mỗi file `eval/recorded/<id>.json` ghi `promptVersion`, `model`, `inputSha256`. `eval-ci` fail nếu prompt/model hiện tại khác (buộc ghi lại khi đổi prompt/model), hoặc input của ca đổi, hoặc thiếu ca nào. `inputSha256` của synth tính trên HTML đã điền (giống byte giữa các máy), của hard-cases tính trên file |
| 3 | Holdout trong CI | Không. CI và `--record` chỉ dùng dev; holdout chỉ chạy tay khi chốt kết quả |
| 4 | Commit output LLM của 36 ca dev | Có, `eval/recorded/` (dữ liệu hư cấu SAMPLE, khoảng 36 file JSON nhỏ). Không commit ảnh synth |
| 5 | `playwright` cho `ui.ts` | Thêm vào devDependencies gốc (cùng bản 1.64.1 với `tools/synth`), vì script nằm trong `.claude/` và chỉ thấy `node_modules` gốc. Đổi `package.json` gốc (vùng kiến trúc) |
| 6 | `down.sh --clean` xoá dữ liệu | Chỉ xoá document (và file của chúng) tạo **sau** mốc giờ `up.sh` ghi, trên DB dev; in danh sách trước khi xoá. Không đụng staff, user, DB test |

## Thiết kế

### Script verify (`.claude/skills/verify/scripts/`)

| Script | Làm gì |
| --- | --- |
| `up.sh [--web]` | `docker compose up -d --wait db redis`, `make db-migrate db-seed`, chạy API + worker (+ web) nền, log vào `.verify/logs/`, PID vào `.verify/pids`, mốc giờ vào `.verify/started-at`; chờ `/ready` (qua `:3000/api` nếu `--web`) tối đa 90 giây, quá thì in 20 dòng log cuối và exit 1 |
| `down.sh [--clean]` | dừng các PID đã ghi (cả cây process); `--clean`: liệt kê rồi xoá document tạo sau mốc, xoá file trong `data/files/` của chúng |
| `api.sh [--as <email>] METHOD PATH [@file \| json]` | đăng nhập (mật khẩu seed) với cookie jar riêng mỗi email, gọi API, in một dòng `status time` rồi body đã cắt 2000 ký tự |
| `ui.ts --path <p> --shot <file> [--login <email>] [--wait-text <t>]` | Playwright Chromium; đăng nhập qua `/api/auth/login` trong cùng context; mở trang, chờ chữ, chụp; in JSON: status, title, lỗi console, request ≥ 400 |

### Eval

- `--record`: sau khi chạy (thật hoặc cache), ghi `eval/recorded/<id>.json` cho mọi ca dev: `{ promptVersion, model, inputSha256, classification?, extraction?, error, usage, latencyMs }`.
- `--recorded`: không đọc file ảnh, không gọi LLM; lấy kết quả từ `eval/recorded/`, kiểm 3 điều kiện ở mục duyệt 2.
- `--no-save`: in tóm tắt, không ghi `eval/runs/` và `eval/report.md` (thay cho việc xoá run thử bằng tay ở plan 18).
- Cổng: `checkGate(metrics, gate)` (hàm thuần) → danh sách lỗi; `eval-ci` exit 1 nếu có lỗi, in ca duyệt nhầm.
- `make eval-ci` = `make synth ARGS=--cases-only SEED=1` + eval `--recorded --no-save --gate eval/gate.json` (split dev).

### Synth

`--cases-only`: chạy `buildCards`, ghi HTML + `cases.json`, bỏ bước render (không cần Chromium). Vẫn xoá rồi ghi lại `data/synth/cpr/` như chế độ thường, nên sau đó ảnh không còn; muốn có ảnh thì chạy `make synth` thường.

## Thay đổi

| File | Thay đổi |
| --- | --- |
| `.claude/skills/verify/scripts/{up.sh,down.sh,api.sh,ui.ts}` | mới |
| `.claude/skills/verify/SKILL.md`, `FEATURE_MAP.md` | dùng script, bỏ "chưa có" |
| `apps/api/scripts/eval.ts`, `apps/api/src/eval/{recorded,gate}.ts` (+ spec), `run-case.ts` | `--record`, `--recorded`, `--no-save`, `--gate` |
| `eval/recorded/*.json`, `eval/gate.json`, `eval/README.md` | output đã ghi, mức chặn |
| `tools/synth/src/generate.ts`, `README.md` | `--cases-only` |
| `Makefile` | `eval-ci`, `synth` nhận `ARGS` |
| `.github/workflows/ci.yml` | bước `make eval-ci` |
| `package.json` (gốc), `pnpm-lock.yaml` | `playwright` |
| `.gitignore` | `.playwright-mcp/` |
| `CLAUDE.md` | mục Lệnh: `eval-ci`; CI chạy thêm `eval-ci` |

## Vùng kiến trúc bị chạm

- `.claude/skills/verify/**`, `.github/**`, `Makefile`, `**/package.json` (gốc), `CLAUDE.md`.
- Không chạm contract, prompt, `config/rules/**`, DB, `eslint.config.mjs`, `.claude/settings.json`, `.claude/hooks/**`.

## Contract / config / prompt bị ảnh hưởng

Không. File `eval/recorded/*.json` có schema riêng trong `apps/api/src/eval/recorded.ts` (Zod), không phải contract dùng chung.

## Quyết định đáng nhớ

- **Chỗ khó nhất:** CI không render lại được ảnh synth giống byte (font khác máy), nên không dùng được cache theo sha256 ảnh. Khoá output đã ghi theo **id ca + sha256 HTML** (HTML sinh bằng JS thuần, giống byte mọi nơi).
- **Đã loại:** gọi LLM thật trong CI: tốn tiền mỗi PR, cần secret, kết quả dao động làm CI chập chờn.
- **Đã loại:** commit cả `eval/cache/`: khoá theo sha256 ảnh, máy khác không trúng.
- **Khi nào hỏng:** đổi template synth mà không `--record` lại → `eval-ci` đỏ vì input đổi (đúng ý); đổi code gọi LLM mà không đổi prompt version → output đã ghi vẫn được coi là đúng (giới hạn đã biết từ plan 18).

## Tiêu chí xong

- [ ] `up.sh` → `api.sh` upload thẻ 01 → `ui.ts` chụp màn kết quả → `down.sh --clean`: chạy trọn không cần lệnh tay nào khác; DB dev và `data/files/` trở về như trước.
- [ ] `make eval-ci` chạy không có `ANTHROPIC_API_KEY`, 0 lời gọi LLM, ra đúng metric dev như `make eval` từ cache.
- [ ] Đổi tạm `minFieldConfidence` lên 0.8 (làm duyệt nhầm tăng) → `make eval-ci` exit 1; đổi prompt version giả → exit 1 vì output cũ; xoá một file recorded → exit 1.
- [ ] CI có bước `eval-ci` và xanh trên PR này.
- [ ] `make lint`, `make typecheck`, `make test`, `make test-int` xanh.
- [ ] Evidence report trong PR, lần này dùng chính các script mới.

## Rủi ro / câu hỏi

1. **`up.sh` để lại process mồ côi** nếu bị ngắt: `down.sh` đọc PID file; nếu file mất, in lệnh `lsof -iTCP:8787` để dọn tay.
2. **CI thêm thời gian:** `eval-ci` khoảng 10 giây (không trình duyệt, không LLM).

## Verification plan

**Mức rủi ro:** T2. Không đổi hành vi sản phẩm; đổi CI (thêm cổng chặn) và công cụ kiểm chứng. Cổng chặn sai thì hoặc chặn nhầm PR tốt, hoặc để lọt duyệt nhầm, nên kiểm cả hai chiều.

**Hành vi kỳ vọng:**

- Một lệnh bật app, một lệnh gọi API có đăng nhập, một lệnh chụp UI, một lệnh tắt và dọn.
- PR làm tăng số ca duyệt nhầm trên dev thì CI đỏ, không cần ai nhớ chạy eval.

**Các mức kiểm:**

- [ ] L0: `make lint`, `make typecheck`; `bash -n` các script `.sh`.
- [ ] L1: `make test`: `gate.spec` (dưới/bằng/trên mức), `recorded.spec` (đọc, thiếu file, prompt/model khác, input khác), `run-case.spec` chế độ recorded.
- [ ] L2: chuỗi `up.sh` → `api.sh` → `ui.ts` → `down.sh --clean` trên máy dev (worker gọi Haiku thật 1 lần); `make eval-ci` không có khoá.
- [ ] L2 Eval: `make eval-ci` ra cùng metric dev với `make eval` (cache).
- [ ] L3: `ui.ts` chụp màn S1 sau khi upload; xem ảnh.
- [ ] CI: bước `eval-ci` xanh trên PR; thử đỏ ở local như tiêu chí xong.

**Kịch bản:**

| # | Kịch bản | Kết quả kỳ vọng |
| --- | --- | --- |
| 1 | `up.sh --web` | in URL, exit 0 trong < 90 giây; `.verify/pids`, `.verify/started-at` có |
| 2 | `up.sh` khi Postgres tắt / cổng 8787 bận | exit 1, in log cuối |
| 3 | `api.sh --as staff-marisol@example.test POST /documents @eval/hard-cases/cpr/01-expires.png` | `201` + documentId |
| 4 | `api.sh GET /documents` không `--as` | `401` |
| 5 | `ui.ts --login staff-marisol@… --path / --wait-text "Đã tự duyệt" --shot …` | ảnh có thẻ đã tự duyệt; JSON liệt kê lỗi console (chỉ favicon nếu có) |
| 6 | `down.sh --clean` | liệt kê đúng document vừa tạo, xoá cả file; staff/user còn nguyên; process đã tắt |
| 7 | `make eval ARGS=--record` | 36 file `eval/recorded/`, không có ca holdout |
| 8 | `make eval-ci` không có khoá | metric giống `make eval` cache; exit 0 (2 ≤ 2) |
| 9 | Hạ tạm ngưỡng rule để duyệt nhầm tăng | exit 1, in ca vượt |
| 10 | Prompt version giả, xoá một file recorded, sửa một template synth | exit 1, nói rõ lý do từng ca |
| 11 | `make eval ARGS=--no-save` | không có file mới trong `eval/runs/`, `report.md` không đổi |

**Test mới phải đỏ trước:** `gate.spec`, `recorded.spec` viết trước code; phá `checkGate` (dùng `<` thay `<=`) → đỏ.

**Thay đổi feature map:** mục Eval thêm `eval-ci`, `--record`, `--no-save`; mục đầu file ghi cách dùng script verify.

**Những gì sẽ KHÔNG kiểm, và lý do:**

- `up.sh` trên Linux: chỉ có máy macOS; CI không chạy script verify.
- Độ dao động của LLM: output ghi sẵn cố định một lần chạy; đo dao động để ở plan 21.

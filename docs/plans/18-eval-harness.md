# 18 · Eval harness trên ca khó (baseline đầu tiên)

Phase: P2 · Trạng thái: Đã duyệt · Ngày: 2026-11-06

## Mục tiêu

`make eval` hiện chỉ in "chưa hiện thực". Làm xong thì `make eval` chạy 6 ca trong `eval/hard-cases/cpr/` qua đúng `LlmService`, prompt và rule engine mà worker đang dùng, so với đáp án, rồi ghi `eval/runs/<id>.json` và `eval/report.md` có `falseApproveRate`, độ chính xác từng trường, chi phí, độ trễ, so với lần trước. Có cache LLM nên chỉ đổi rule thì 0 lời gọi LLM mới. Đây là baseline đầu tiên ghi vào STATUS.

## Phạm vi

- **Trong:** chốt contract eval; chuyển đáp án sang `GoldenCase`; script eval trong `apps/api`; cache LLM; chạy song song có giới hạn; metric, cắt theo tag, report so với lần trước; `make eval`.
- **Ngoài:**
  - `tools/synth` và dữ liệu sinh: plan sau (Liam 2026-11-06: eval trước).
  - Split `holdout`: 6 ca đều là `dev`; holdout có khi có synth.
  - Đổi prompt, rule, model, ngưỡng: không đổi gì.
  - Thêm ca khó (roadmap đòi 10): plan sau, cùng synth.

## Quyết định của Liam (2026-11-06)

1. Eval trước, synth sau.
2. Code eval nằm trong `apps/api`, dùng lại `LlmService` và prompt thật. `eval/` chỉ giữ dữ liệu, `runs/`, `report.md`.
3. Contract eval sửa theo đề xuất ở mục duyệt 1.
4. Giá token là hằng số có ghi nguồn: `claude-haiku-5-5` $0.10 / 1M input, $0.50 / 1M output (prompt ≤ 100K token). Nguồn: bảng giá trong skill `claude-api`, cache 2026-10-06.

## Cần anh duyệt riêng

| # | Vấn đề | Đề xuất |
| --- | --- | --- |
| 1 | Contract `eval.ts` còn là bản nháp | `GoldenCase`: giữ, thêm `declaredDocType?`; `id` = tên fixture. `EvalMetrics`: thêm `falseApproveCount`, `llmCalls`, `cacheHits`, `inputTokens`, `outputTokens`, `costUsdTotal`, `durationMs`; giữ `costUsdPerDoc`. Mới `EvalCaseResult` (id, tags, decision kỳ vọng và thực tế, `falseApprove`, trường sai, lỗi, latency, cached). `EvalRun` thêm `cases: EvalCaseResult[]`, `previousRunId?` |
| 2 | Định nghĩa `falseApprove` | Ca bị **tự duyệt** mà **hoặc** đáp án là `needs_review`, **hoặc** có trường chính đọc sai so với đáp án. Lý do: tự duyệt một giấy đọc sai cũng là duyệt nhầm, dù đáp án nói giấy đó tốt. `falseApproveRate = falseApproveCount / n` |
| 3 | Đáp án `decision` của ca 03 (hạn chỉ ghi "renewal 03/2028") | `needs_review`. Hạn phải suy luận từ tháng, không in ngày; tự duyệt thì chỉ đúng khi LLM đoán đúng ngày cuối tháng. Hệ quả: baseline có thể ra `falseApproveRate > 0` nếu Haiku chấm confidence 0.85 như hôm nay. Đó là số thật, không chỉnh ngưỡng trong plan này |
| 4 | Dọn chỗ cũ | Xoá package stub `eval/` (`package.json`, `src/`, `tsconfig.json`) và `pnpm-lock` theo đó; `expected.json` thay bằng `eval/hard-cases/cpr/cases.json` (`GoldenCase[]`), không giữ hai nguồn đáp án. `make eval` chạy `pnpm --filter @credflow/api eval`. Sửa dòng `eval/` trong CLAUDE.md |

## Thiết kế

### Đáp án (`eval/hard-cases/cpr/cases.json`)

| id | staff | `decision` | tags |
| --- | --- | --- | --- |
| `01-expires` | Marisol Quennell | `auto_approve` | `clean` |
| `02-valid-2-years` | Tobias Arkwright-Lenz | `needs_review` | `date_format_ambiguous`, `no_printed_expiry` |
| `03-renewal-month` | Marisol Quennell | `needs_review` (mục duyệt 3) | `name_variant`, `no_printed_expiry` |
| `04-tb-test` | Maren Ostrowe | `needs_review` | `wrong_doc_type` |
| `05-injection` | Odalys Venn | `needs_review` | `issuer_not_accepted` |
| `06-wallet-signature` | Maren Ostrowe | `auto_approve` | `clean` |

`asOf` cố định `2026-11-06` cho mọi ca. `fields` lấy từ `expected.json` hiện có (06 thêm ở plan 16). Staff lấy theo seed (`scripts/seed-data.ts`), parse bằng `StaffProfile`.

### Luồng một ca

```
đọc file → sha256
cache hit (eval/cache/<sha256>.<promptVersion>.<model>.json)? → dùng classification, extraction, usage, latency đã lưu
cache miss → LlmService.classify; nếu cpr_card → extractCpr; lưu cache (kể cả lỗi LlmError không retry được)
evaluateRules({ extraction, classification, declaredDocType, staff, config, asOf }) → route
so trường với đáp án → EvalCaseResult
```

- Rule luôn chạy lại (thuần, rẻ), nên đổi rule không gọi LLM.
- Bị ngắt giữa chừng: ca đã xong nằm trong cache, chạy lại chỉ gọi LLM cho ca chưa có. Không cần cờ `--resume` riêng.
- LLM lỗi: ca ra `needs_review` như pipeline thật, ghi `error`. Lỗi tạm (429, 5xx) không cache.
- Chạy song song tối đa 3 ca (`mapWithLimit`, viết tay khoảng 15 dòng, không thêm `p-limit`).

### So trường

- Ngày: so chuỗi `YYYY-MM-DD`. `holderName`: `nameMatches` của `packages/rules`. `issuerName`: `issuerMatches`. Trường khác: so sau khi `trim`.
- Chỉ so trường có trong đáp án. Đáp án `null` mà LLM đọc ra giá trị → sai.
- Export `nameMatches`, `issuerMatches` từ `packages/rules/src/index.ts` (hiện chưa export).

### Code

| File | Vai trò |
| --- | --- |
| `apps/api/src/eval/compare.ts` | so trường, `falseApprove` (hàm thuần) |
| `apps/api/src/eval/metrics.ts` | `EvalMetrics` tổng và theo tag, p50/p95, chi phí (hàm thuần) |
| `apps/api/src/eval/report.ts` | render `report.md`, bảng so với lần trước (hàm thuần) |
| `apps/api/src/eval/cache.ts` | đọc/ghi cache, khoá `(sha256, promptVersion, model)` |
| `apps/api/src/eval/limit.ts` | `mapWithLimit` |
| `apps/api/src/eval/pricing.ts` | hằng số giá + nguồn |
| `apps/api/src/eval/*.spec.ts` | unit test cho các file trên |
| `apps/api/scripts/eval.ts` | CLI: nạp `.env`, tạo `LlmService` bằng `new` (client Anthropic bọc để đếm token), chạy, ghi file, in tóm tắt, exit code |

CLI: `pnpm --filter @credflow/api eval [--split dev] [--no-cache]`. Exit 0 khi chạy xong (kể cả `falseApproveRate > 0`, vì đó là số liệu); exit 1 khi lỗi cấu hình, đáp án sai schema, hoặc ca nào không chạy được.

## Thay đổi

| File | Thay đổi |
| --- | --- |
| `packages/contracts/src/eval.ts`, `fixtures/GoldenCase.json`, `fixtures/EvalRun.json` | mục duyệt 1 |
| `packages/rules/src/index.ts` | export `nameMatches`, `issuerMatches` |
| `apps/api/src/eval/*`, `apps/api/scripts/eval.ts` | mới |
| `apps/api/package.json` | script `eval` |
| `eval/hard-cases/cpr/cases.json` (mới), `expected.json` (xoá) | đáp án |
| `eval/package.json`, `eval/src/`, `eval/tsconfig.json` (xoá), `pnpm-lock.yaml` | mục duyệt 4 |
| `eval/README.md`, `eval/report.md` (mới, commit) | cách chạy, report đầu tiên |
| `.gitignore` | `eval/cache/` |
| `Makefile`, `CLAUDE.md` | `make eval` trỏ sang api |
| `.claude/skills/verify/FEATURE_MAP.md` | mục Eval |
| `docs/STATUS.md` | baseline |

## Vùng kiến trúc bị chạm

- `packages/contracts/src/**` (`eval.ts`).
- `**/package.json` (`apps/api/package.json`, xoá `eval/package.json`).
- `Makefile`, `CLAUDE.md`, `.claude/skills/verify/**`.
- Không chạm prompt, `config/rules/**`, DB schema, `eslint.config.mjs`, vitest config.

## Contract / config / prompt bị ảnh hưởng

- **Contract:** `eval.ts` chốt lần đầu (mục duyệt 1). Không đụng contract khác.
- Prompt, model, rule, ngưỡng: không đổi.

## Quyết định đáng nhớ

- **Chỗ khó nhất:** eval phải đo **đúng** đường code của worker, không phải một bản sao. Dùng lại `LlmService` và `evaluateRules`; chỉ thay phần DB/queue bằng vòng lặp trong script.
- **Đã loại:** gọi qua HTTP API + worker: giống production nhất nhưng cần DB, tạo staff cho từng ca, và không cache được theo prompt/model.
- **Đã loại:** `p-limit`: thêm dependency cho việc 15 dòng làm được; tự viết cũng là phần học của P2.
- **Khi nào hỏng:** khoá cache không có `versions.rules` nên đổi rule dùng lại LLM (đúng ý); nhưng đổi `LlmService` (ví dụ `max_tokens`, `effort`) mà không đổi prompt version thì cache cũ bị dùng sai. Ghi vào README: đổi code gọi LLM thì chạy `--no-cache`.

## Tiêu chí xong

- [ ] `make eval` chạy 6 ca, ghi `eval/runs/<id>.json` (parse qua `EvalRun`) và `eval/report.md`.
- [ ] Chạy lần hai không đổi gì: 0 lời gọi LLM mới, metric giống hệt lần một.
- [ ] Đổi một tham số rule (thử tạm, không commit): 0 lời gọi LLM mới, metric đổi theo.
- [ ] Report ghi `versions`, tổng thời gian, chi phí ước tính, bảng so với lần trước, danh sách ca `falseApprove`.
- [ ] Baseline ghi vào `docs/STATUS.md`.
- [ ] `make lint`, `make typecheck`, `make test`, `make test-int` xanh.
- [ ] Evidence report có trong PR.

## Rủi ro / câu hỏi

1. **`tsx` và decorator:** `LlmService` có `@Inject` ở tham số constructor. `tsx` (esbuild) cần hỗ trợ parameter decorator; nếu không chạy được thì build script bằng SWC như `nest build`. Kiểm ở bước đầu.
2. **Kết quả LLM không tất định:** chạy không cache hai lần có thể khác (ca 03). Report ghi rõ ca nào lấy từ cache.
3. **Chi phí:** lần đầu khoảng 11 lượt gọi, dưới $0.01 theo giá trên.

## Verification plan

**Mức rủi ro:** T2. Không đổi hành vi hệ thống đang chạy, nhưng số liệu eval sẽ quyết định các thay đổi T3 về sau, nên kiểm tính đúng của metric như T3: test thuần cho từng công thức, và đối chiếu tay một lần với kết quả chạy thật.

**Hành vi kỳ vọng:**

- `make eval` cho bảng metric và danh sách ca duyệt nhầm, không cần DB hay worker.
- Chỉ đổi rule thì không tốn tiền LLM.
- Ca tự duyệt mà đọc sai trường thì bị tính là duyệt nhầm.

**Các mức kiểm:**

- [ ] L0: `make lint`, `make typecheck`.
- [ ] L1: `make test`: `compare.spec`, `metrics.spec`, `report.spec`, `cache.spec`, `limit.spec`; fixture contract mới.
- [ ] L2: chạy `make eval` thật với Haiku (lần 1 không cache, lần 2 cache), đối chiếu tay `eval/runs/<id>.json` từng ca với kết quả chạy thật ở plan 16.
- [ ] L2 Eval: chính là thay đổi này; ghi baseline.
- [ ] L3, L4: không áp dụng.

**Kịch bản:**

| # | Kịch bản | Kết quả kỳ vọng |
| --- | --- | --- |
| 1 | `compare`: tự duyệt + đáp án `needs_review` | `falseApprove = true` |
| 2 | `compare`: tự duyệt + đáp án `auto_approve` + một trường sai | `falseApprove = true` |
| 3 | `compare`: `needs_review` dù trường sai | `falseApprove = false` |
| 4 | `compare`: "QUENNELL, MARISOL" so "Marisol Quennell"; đáp án `null` mà LLM có giá trị | khớp; sai |
| 5 | `metrics`: 0 ca, 1 ca, tag rỗng, p50/p95 với 1, 2, 6 giá trị | không chia cho 0, số đúng tay |
| 6 | `cache`: hit, miss, khoá khác prompt version, lỗi tạm không cache | đúng |
| 7 | `mapWithLimit`: không quá 3 việc cùng lúc, giữ thứ tự kết quả, một việc lỗi | đúng |
| 8 | `make eval` lần 1 (thật) | 6 ca, khoảng 11 lượt gọi, report sinh ra |
| 9 | `make eval` lần 2 | 0 lượt gọi, metric giống hệt |
| 10 | Đổi tạm `minFieldConfidence` 0.85 → 0.9 rồi `make eval` | 0 lượt gọi, ca 03 (và có thể ca khác) đổi decision; hoàn tác |
| 11 | `cases.json` sai schema | exit 1, báo đúng ca và trường |

**Test mới phải đỏ trước:** viết spec trước code cho `compare`, `metrics`, `limit` và chạy cho thấy đỏ (module chưa có thì đỏ vì import; với `falseApprove` sẽ cho thấy đỏ bằng bản cố ý bỏ điều kiện "trường sai").

**Thay đổi feature map:** mục mới "Eval".

**Những gì sẽ KHÔNG kiểm, và lý do:**

- Holdout: chưa có ca holdout.
- Độ ổn định của metric qua nhiều lần chạy không cache: tốn tiền, để P2 sau khi có synth.

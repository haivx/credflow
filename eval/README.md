# eval

Dữ liệu và kết quả của eval. Code nằm ở `apps/api/src/eval/` và `apps/api/scripts/eval.ts` (plan 18), để đo đúng `LlmService`, prompt và rule engine mà worker đang dùng.

## Chạy

```bash
make eval                          # split dev, dùng cache LLM
make eval ARGS=--no-cache          # gọi LLM lại cho mọi ca (vẫn ghi cache mới)
make eval ARGS="--split holdout"   # chỉ khi chốt kết quả cuối phase
make eval ARGS="--cases eval/hard-cases/cpr/cases.json"
```

Cần `ANTHROPIC_API_KEY` trong `.env`. Không cần DB, Redis hay worker.

Exit 0 khi chạy xong, kể cả khi có ca duyệt nhầm (đó là số liệu). Exit 1 khi `cases.json` sai schema, thiếu khoá, hoặc có ca không chạy được (lỗi LLM tạm thời sau khi SDK đã thử lại). Ca đã xong vẫn nằm trong cache, chạy lại không tốn tiền cho chúng.

## Dữ liệu

| Nguồn | Nơi | Commit? |
| --- | --- | --- |
| Ca khó làm tay (giả lập) + đáp án `cases.json` (`GoldenCase[]`) | `eval/hard-cases/` | Có |
| Output Haiku đã ghi cho test (plan 14, 16) | `eval/hard-cases/cpr/recorded/` | Có |
| Giấy giả lập sinh bằng `make synth SEED=…` | `data/synth/` | Không (sinh lại được) |
| Cache LLM | `eval/cache/` | Không |
| Kết quả từng lần chạy (`EvalRun`) | `eval/runs/<id>.json` | Không |
| Báo cáo mới nhất | `eval/report.md` | Có |

`split`: `dev` dùng khi phát triển; `holdout` chỉ chạy khi chốt kết quả cuối phase, không dùng để chỉnh prompt.

## Cache

Khoá: sha256 nội dung file + prompt version + model. Không có `versions.rules`, nên đổi rule hay ngưỡng thì 0 lời gọi LLM mới.

**Đổi code gọi LLM mà không đổi prompt version** (`max_tokens`, `effort`, cách gửi file…) thì cache cũ không còn đúng: chạy `--no-cache`.

## Metric (`EvalMetrics`)

- **`falseApproveRate`** (quan trọng nhất, mục tiêu 0): ca bị tự duyệt mà đáp án là `needs_review`, **hoặc** đọc sai một trường có trong đáp án. Chuyển người duyệt thì không bao giờ là duyệt nhầm.
- `autoApproveRate`, `classificationAccuracy`, `fieldAccuracy` theo trường, token, chi phí ước tính (giá ở `apps/api/src/eval/pricing.ts`), latency p50/p95 (nearest-rank). Cắt theo `CaseTag`.

So trường: ngày so chuỗi `YYYY-MM-DD`; `holderName`, `issuerName` dùng cùng hàm chuẩn hoá với rule engine; trường khác so nguyên văn sau khi `trim`. Đáp án `null` nghĩa là trường đó phải để trống.

## Quy tắc

- Mọi thay đổi prompt, model, rule, ngưỡng → `make eval` → dán bảng so sánh trong `eval/report.md` vào PR.
- Report luôn ghi `versions` của lần chạy. Thử tạm một thay đổi rule thì xoá run thử trong `eval/runs/` trước khi chạy lần chính, để "lần trước" là baseline thật.

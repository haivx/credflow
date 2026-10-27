# eval

Harness đo pipeline trên golden set. Hiện thực ở P2 (`docs/roadmap.md`).

## Dữ liệu

| Nguồn | Nơi | Commit? |
| --- | --- | --- |
| Giấy giả lập sinh bằng `make synth SEED=…` | `data/synth/` | Không (sinh lại được) |
| Ca khó làm tay (vẫn là giả lập) | `eval/hard-cases/` | Có |
| Kết quả từng lần chạy | `eval/runs/<id>.json` | Không |
| Báo cáo mới nhất | `eval/report.md` | Có |

Mỗi ca là một `GoldenCase` (contract). `split`: `dev` dùng khi phát triển; `holdout` chỉ chạy khi chốt kết quả cuối phase, không dùng để chỉnh prompt.

## Metric

`EvalMetrics`: `falseApproveRate` (quan trọng nhất, mục tiêu 0), `autoApproveRate`, `classificationAccuracy`, `fieldAccuracy` theo trường, chi phí và độ trễ. Cắt theo `CaseTag`.

So trường: ngày so chính xác chuỗi `YYYY-MM-DD`; tên so sau khi chuẩn hoá (cùng hàm với rule engine); enum so chính xác.

## Quy tắc

- Mọi thay đổi prompt, model, rule, ngưỡng → `make eval` → dán bảng so sánh vào PR.
- Report luôn ghi `versions` của lần chạy.

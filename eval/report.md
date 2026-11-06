# Eval report

> Sinh tự động bởi `make eval` (plan 18). Đừng sửa tay.

- **Run:** `2026-11-06T04-01-19-885Z` · split `dev` · 6 ca
- **Versions:** pipeline `16`, prompt `classify@1+extract-cpr@1`, model `claude-haiku-5-5`, rules `1`
- **Thời gian chạy:** 8 ms · **Chi phí ước tính:** $0.00391 (giá ghi trong `apps/api/src/eval/pricing.ts`; tính cả ca lấy từ cache)
- **So với:** `2026-11-06T04-00-58-615Z` (versions rules `1`, prompt `classify@1+extract-cpr@1`)

## Metric

| Metric | Lần này | Lần trước | Δ |
| --- | --- | --- | --- |
| falseApproveRate (mục tiêu 0) | 0.0% | 0.0% | 0 |
| falseApproveCount | 0 | 0 | 0 |
| autoApproveRate | 33.3% | 33.3% | 0 |
| classificationAccuracy | 100.0% | 100.0% | 0 |
| latency p50 | 3261 ms | 3261 ms | 0 |
| latency p95 | 4866 ms | 4866 ms | 0 |
| chi phí / giấy (ước tính) | $0.00065 | $0.00065 | 0 |
| chi phí tổng (ước tính) | $0.00391 | $0.00391 | 0 |
| lượt gọi LLM lần này | 0 | 0 | 0 |
| ca lấy từ cache | 6 | 6 | 0 |

## Duyệt nhầm

Không có ca nào.

## Từng ca

| Ca | Kỳ vọng | Thực tế | Lý do | Trường sai | Cache | Lỗi |
| --- | --- | --- | --- | --- | --- | --- |
| `01-expires` | auto_approve | auto_approve | — | — | có | — |
| `02-valid-2-years` | needs_review | needs_review | MISSING_FIELD, EXPIRED | courseType, completionDate, validityText | có | — |
| `03-renewal-month` | needs_review | needs_review | LOW_CONFIDENCE | — | có | — |
| `04-tb-test` | needs_review | needs_review | NO_RULES_EVALUATED | — | có | — |
| `05-injection` | needs_review | needs_review | ISSUER_NOT_ACCEPTED | — | có | — |
| `06-wallet-signature` | auto_approve | auto_approve | — | — | có | — |

## Độ chính xác từng trường

| Trường | Lần này | Lần trước |
| --- | --- | --- |
| cardNumber | 100.0% | 100.0% |
| completionDate | 80.0% | 80.0% |
| courseType | 50.0% | 50.0% |
| expirationDate | 100.0% | 100.0% |
| holderName | 100.0% | 100.0% |
| issuerName | 100.0% | 100.0% |
| validityText | 66.7% | 66.7% |

## Theo tag

| Tag | n | falseApproveRate | autoApproveRate |
| --- | --- | --- | --- |
| clean | 2 | 0.0% | 100.0% |
| date_format_ambiguous | 1 | 0.0% | 0.0% |
| issuer_not_accepted | 1 | 0.0% | 0.0% |
| name_variant | 1 | 0.0% | 0.0% |
| no_printed_expiry | 2 | 0.0% | 0.0% |
| wrong_doc_type | 1 | 0.0% | 0.0% |

# Eval report

> Sinh tự động bởi `make eval` (plan 18). Đừng sửa tay.

- **Run:** `2026-11-06T14-00-25-647Z` · split `dev` · 40 ca
- **Versions:** pipeline `21`, prompt `classify@1+extract-cpr@1`, model `claude-haiku-5-5`, rules `1`
- **Thời gian chạy:** 35 ms · **Chi phí ước tính:** $0.02796 (giá ghi trong `apps/api/src/eval/pricing.ts`; tính cả ca lấy từ cache)
- **So với:** `2026-11-06T13-50-25-631Z` (versions rules `1`, prompt `classify@1+extract-cpr@1`)

## Metric

| Metric | Lần này | Lần trước | Δ |
| --- | --- | --- | --- |
| falseApproveRate (mục tiêu 0) | 0.0% | 0.0% | 0 |
| falseApproveCount | 0 | 0 | 0 |
| autoApproveRate | 55.0% | 58.3% | -3.3% |
| classificationAccuracy | 100.0% | 100.0% | 0 |
| latency p50 | 3160 ms | 3094 ms | +66 ms |
| latency p95 | 4637 ms | 4637 ms | 0 |
| chi phí / giấy (ước tính) | $0.00070 | $0.00071 | $-0.00001 |
| chi phí tổng (ước tính) | $0.02796 | $0.02539 | +$0.00257 |
| lượt gọi LLM lần này | 0 | 0 | 0 |
| ca lấy từ cache | 40 | 36 | +4 |

## Duyệt nhầm

Không có ca nào.

## Theo nguồn

| Nguồn | n | falseApproveRate | autoApproveRate | classificationAccuracy |
| --- | --- | --- | --- | --- |
| hard-cases | 10 | 0.0% | 30.0% | 100.0% |
| synth | 30 | 0.0% | 63.3% | 100.0% |

## Từng ca

| Ca | Nguồn | Kỳ vọng | Thực tế | Lý do | Trường sai | Cache | Lỗi |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `01-expires` | hard-cases | auto_approve | auto_approve | — | — | có | — |
| `02-valid-2-years` | hard-cases | needs_review | needs_review | MISSING_FIELD, EXPIRED | completionDate | có | — |
| `03-renewal-month` | hard-cases | needs_review | needs_review | LOW_CONFIDENCE, DATE_INCONSISTENT | — | có | — |
| `04-tb-test` | hard-cases | needs_review | needs_review | NO_RULES_EVALUATED | — | có | — |
| `05-injection` | hard-cases | needs_review | needs_review | ISSUER_NOT_ACCEPTED | — | có | — |
| `06-wallet-signature` | hard-cases | auto_approve | auto_approve | — | — | có | — |
| `07-verbatim-ambiguous` | hard-cases | needs_review | needs_review | MISSING_FIELD, DATE_INCONSISTENT, EXPIRED | — | có | — |
| `08-ordinal-date` | hard-cases | auto_approve | needs_review | DATE_INCONSISTENT | — | có | — |
| `09-vietnamese-name` | hard-cases | auto_approve | auto_approve | — | — | có | — |
| `10-expired-yesterday` | hard-cases | needs_review | needs_review | EXPIRED | — | có | — |
| `synth-cpr-0002` | synth | needs_review | needs_review | NAME_MISMATCH | — | có | — |
| `synth-cpr-0005` | synth | needs_review | needs_review | ISSUER_NOT_ACCEPTED | — | có | — |
| `synth-cpr-0006` | synth | needs_review | needs_review | DATE_INCONSISTENT | completionDate, expirationDate | có | — |
| `synth-cpr-0009` | synth | auto_approve | auto_approve | — | — | có | — |
| `synth-cpr-0011` | synth | auto_approve | auto_approve | — | — | có | — |
| `synth-cpr-0013` | synth | needs_review | needs_review | EXPIRED | — | có | — |
| `synth-cpr-0015` | synth | needs_review | needs_review | ISSUER_NOT_ACCEPTED | — | có | — |
| `synth-cpr-0016` | synth | needs_review | needs_review | EXPIRED | — | có | — |
| `synth-cpr-0017` | synth | needs_review | needs_review | EXPIRED | — | có | — |
| `synth-cpr-0018` | synth | auto_approve | auto_approve | — | — | có | — |
| `synth-cpr-0019` | synth | needs_review | needs_review | NAME_MISMATCH | — | có | — |
| `synth-cpr-0020` | synth | auto_approve | auto_approve | — | — | có | — |
| `synth-cpr-0021` | synth | needs_review | needs_review | DATE_INCONSISTENT | — | có | — |
| `synth-cpr-0022` | synth | auto_approve | auto_approve | — | — | có | — |
| `synth-cpr-0023` | synth | auto_approve | auto_approve | — | — | có | — |
| `synth-cpr-0024` | synth | auto_approve | auto_approve | — | — | có | — |
| `synth-cpr-0025` | synth | auto_approve | auto_approve | — | — | có | — |
| `synth-cpr-0026` | synth | auto_approve | auto_approve | — | — | có | — |
| `synth-cpr-0028` | synth | auto_approve | auto_approve | — | — | có | — |
| `synth-cpr-0030` | synth | auto_approve | auto_approve | — | — | có | — |
| `synth-cpr-0031` | synth | needs_review | needs_review | NAME_MISMATCH | — | có | — |
| `synth-cpr-0032` | synth | auto_approve | auto_approve | — | — | có | — |
| `synth-cpr-0033` | synth | auto_approve | auto_approve | — | — | có | — |
| `synth-cpr-0034` | synth | needs_review | needs_review | ISSUER_NOT_ACCEPTED | — | có | — |
| `synth-cpr-0035` | synth | auto_approve | auto_approve | — | — | có | — |
| `synth-cpr-0036` | synth | auto_approve | auto_approve | — | — | có | — |
| `synth-cpr-0037` | synth | auto_approve | auto_approve | — | — | có | — |
| `synth-cpr-0038` | synth | auto_approve | auto_approve | — | — | có | — |
| `synth-cpr-0039` | synth | auto_approve | auto_approve | — | — | có | — |
| `synth-cpr-0040` | synth | auto_approve | auto_approve | — | — | có | — |

## Độ chính xác từng trường

| Trường | Lần này | Lần trước |
| --- | --- | --- |
| cardNumber | 100.0% | 100.0% |
| completionDate | 94.9% | 94.3% |
| courseType | 100.0% | 100.0% |
| expirationDate | 97.4% | 97.1% |
| holderName | 100.0% | 100.0% |
| issuerName | 100.0% | 100.0% |
| validityText | 100.0% | 100.0% |

## Theo tag

| Tag | n | falseApproveRate | autoApproveRate |
| --- | --- | --- | --- |
| blurred | 2 | 0.0% | 100.0% |
| clean | 12 | 0.0% | 91.7% |
| date_format_ambiguous | 3 | 0.0% | 0.0% |
| expired | 4 | 0.0% | 0.0% |
| issuer_not_accepted | 4 | 0.0% | 0.0% |
| name_variant | 7 | 0.0% | 42.9% |
| no_printed_expiry | 4 | 0.0% | 25.0% |
| rotated | 2 | 0.0% | 100.0% |
| skewed_photo | 3 | 0.0% | 100.0% |
| wrong_doc_type | 1 | 0.0% | 0.0% |

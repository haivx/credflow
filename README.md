# CredFlow

[![CI](https://github.com/haivx/credflow/actions/workflows/ci.yml/badge.svg)](https://github.com/haivx/credflow/actions/workflows/ci.yml)

> **English summary.** An AI-assisted credentialing pipeline for healthcare staffing and home-care companies. Staff upload certificates (CPR cards, professional licenses, TB tests, background checks, vaccination records) as photos or PDFs. A vision LLM classifies each document and extracts structured fields, each with an evidence quote from the page. A deterministic rule engine, configured per client, checks expiry, name match, accepted issuers and results. A document is auto-approved only when every blocking rule passes; everything else goes to a human review queue. The LLM reads, code decides: the model never approves anything. Every change to prompts, models or rules is measured on a synthetic golden set, and the headline metric is the false-approve rate (target: zero). All data is synthetic. Stack: Next.js 14, NestJS on Node, Postgres + Drizzle, BullMQ + Redis, Zod contracts, TypeScript end to end.

Hệ thống xử lý giấy tờ credentialing cho công ty dịch vụ chăm sóc sức khoẻ: AI phân loại và trích xuất, rule engine kiểm tra, ca không chắc chuyển cho người duyệt.

> Trạng thái: P0 xong (API, worker, Postgres, Redis, contract cơ bản), đang làm P1. Xem [`docs/roadmap.md`](docs/roadmap.md) và [`docs/STATUS.md`](docs/STATUS.md).

## Tài liệu

| File | Nội dung |
| --- | --- |
| [`docs/product.md`](docs/product.md) | Bài toán, nguyên tắc, pipeline, rule, eval, kiến trúc, quyết định còn mở |
| [`docs/flows.md`](docs/flows.md) | Luồng người dùng và bản đồ màn hình |
| [`docs/doc-types.md`](docs/doc-types.md) | 5 loại giấy: trường, cách tính hạn, ca khó |
| [`docs/data-policy.md`](docs/data-policy.md) | Chỉ dùng dữ liệu giả lập |
| [`docs/roadmap.md`](docs/roadmap.md) | Phase P0–P6 và tiêu chí hoàn thành |
| [`docs/STATUS.md`](docs/STATUS.md) | Đang ở đâu, làm gì tiếp |
| [`docs/plans/`](docs/plans/README.md) | Plan từng task |
| [`docs/decisions/`](docs/decisions/) | ADR |
| [`docs/case-study.md`](docs/case-study.md) | Khung writeup |
| [`docs/learning/`](docs/learning/README.md) | Lộ trình học, checklist kiến thức để ôn tập |
| [`CLAUDE.md`](CLAUDE.md) | Quy tắc làm việc cho Claude Code |

## Cấu trúc

```
apps/web/            Next.js 14: upload, hàng chờ, màn duyệt, dashboard
apps/api/            NestJS: HTTP + BullMQ worker, gọi LLM
packages/contracts/  Zod schema dùng chung
packages/rules/      Rule engine thuần
config/rules/        Cấu hình rule theo khách hàng (YAML)
eval/                Eval harness và báo cáo
tools/synth/         Bộ sinh giấy tờ giả lập
```

## Bắt đầu

Yêu cầu: Node ≥ 22.13, pnpm 11.9, Docker (có `docker compose`).

```bash
cp .env.example .env   # giá trị mặc định chạy được ngay với docker compose
make setup             # cài deps, bật Postgres + Redis, chạy migration, seed 10 staff giả lập
make dev               # API 127.0.0.1:8787 + worker + web localhost:3000
```

`make setup` chạy lại an toàn (migration đã áp thì bỏ qua, seed không sinh dòng trùng).

Kiểm nhanh khi `make dev` đang chạy:

| URL | Kết quả mong đợi |
| --- | --- |
| `http://127.0.0.1:8787/health` | `200`, process còn sống |
| `http://127.0.0.1:8787/ready` | `200`, Postgres và Redis dùng được |
| `http://127.0.0.1:8787/staff` | `200`, danh sách 10 staff giả lập |
| `http://localhost:3000` | trang web |

Test:

```bash
make test       # unit test, không cần docker
make test-int   # integration test trên Postgres test (cổng 5433) + Redis
make lint && make typecheck
```

CI (GitHub Actions, `.github/workflows/ci.yml`) chạy lint, typecheck, test, test-int ở mỗi PR.

Làm việc với Claude Code: mở repo, chạy `/next` để xem task tiếp theo.

## License

MIT

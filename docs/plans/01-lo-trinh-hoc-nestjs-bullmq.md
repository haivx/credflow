# 01 · Chỉnh mục tiêu và roadmap theo lộ trình học (NestJS + BullMQ, mức middle)

Phase: P0 · Trạng thái: Xong · Ngày: 2026-10-29

## Mục tiêu

Roadmap hiện tại đặt mức "senior backend" (outbox relay, `SKIP LOCKED`, OpenTelemetry, RLS…), quá xa so với mục tiêu thật: **vừa build CredFlow vừa lên mức middle–intermediate Node.js developer**. Plan này đổi lại ba thứ:

1. **Mục tiêu và stack:** chốt NestJS + BullMQ, viết lại ADR 0001 với lý do thật (mục tiêu học), hạ độ khó kỹ thuật về mức middle.
2. **Roadmap:** mỗi phase có mục **🎓 Học được** thay cho "Backend focus". Kiến thức nâng cao chuyển xuống "Để sau", không xoá.
3. **Chế độ dạy và theo dõi tiến độ:** Claude Code giải thích trong lúc làm, mỗi kiến thức có một dòng trong `docs/learning/progress.md` để tick và ôn lại.

Plan này **chỉ sửa docs**. Chuyển `apps/api` từ Hono sang Nest và thêm Redis vào docker compose là task P0 riêng (plan 02), làm sau khi plan này được duyệt.

## Phạm vi

- Trong: ADR 0001, roadmap, CLAUDE.md, product.md (mục 8), README, STATUS, `/wrap`, thư mục `docs/learning/` mới.
- Ngoài: code, `packages/contracts`, schema DB, rule config, prompt.

## Nguyên tắc chọn độ khó

Một kiến thức được giữ trong phase khi đạt cả ba điều kiện sau:

- Hay gặp trong công việc middle Node.js hằng ngày, hoặc hay được hỏi khi phỏng vấn ở mức này.
- Có thể hiểu và tự viết lại sau 1–2 buổi.
- CredFlow thực sự cần nó.

Không đạt thì chuyển sang "Để sau". Riêng những vấn đề mà dự án *bắt buộc* phải xử lý (như dual-write), roadmap chọn **cách đơn giản nhất mà vẫn đúng** và ghi rõ cách nâng cao hơn là gì.

## Quyết định kỹ thuật chính (đưa vào ADR 0001 mới)

| Vấn đề | Bản cũ (quá tầm) | Bản mới (mức middle) | Ghi vào "Để sau" |
| --- | --- | --- | --- |
| Ghi DB + đẩy job (dual-write) | Transactional outbox + relay | Commit `documents` trước, rồi `queue.add` với `jobId = documentId`. Thêm **sweep job** định kỳ (BullMQ repeatable, 1 phút) đẩy lại document kẹt ở `uploaded` quá N phút | Outbox + relay (polling / LISTEN-NOTIFY / CDC) |
| Chặn job trùng | Dedupe ở relay | `jobId = documentId`, kèm worker idempotent: kiểm trạng thái trước khi chạy, ghi bằng upsert | — |
| Transaction qua nhiều service | AsyncLocalStorage / `nestjs-cls` | Truyền `tx` tường minh làm tham số; service nhận `db \| tx` | `nestjs-cls` transactional |
| Validate | (chưa nói) | Zod pipe; **không** dùng class-validator | — |
| Hai reviewer cùng duyệt một ca | `SKIP LOCKED` + lease + optimistic lock | Chỉ optimistic lock (cột `version`) | `SKIP LOCKED`, lease |
| Integration test DB | Testcontainers | Postgres + Redis test trong docker compose | Testcontainers |
| Quan sát hệ thống | OpenTelemetry trace + metrics | Log có cấu trúc (pino) kèm `requestId` / `documentId`; `timingMs` từng bước lưu DB | OTel, k6 load test |
| Lỗi API | RFC 9457 | Exception filter trả về một format JSON thống nhất `{ code, message, details? }` | RFC 9457 |
| Xem ảnh | Presigned URL | Endpoint stream file, có kiểm quyền | Presigned URL (khi có S3) |
| Rule engine không import DB | dependency-cruiser | ESLint `no-restricted-imports` | — |
| Redis mất dữ liệu | AOF hay chấp nhận mất | Chấp nhận mất: Postgres là nguồn sự thật, sweep job đẩy lại. Bắt buộc `maxmemory-policy noeviction` | AOF, Redis HA |

Ràng buộc NestJS ghi trong ADR:

- Cùng một codebase, **hai entrypoint**: `main.ts` (HTTP) và `worker.ts` (BullMQ processor).
- Drizzle inject bằng custom provider (token `DB`).
- `packages/rules` và `packages/contracts` không dùng decorator, không dùng DI.
- Build và test dùng SWC, vì `tsx` / esbuild không hỗ trợ `emitDecoratorMetadata`.

## Thay đổi

| File / module | Thay đổi |
| --- | --- |
| `docs/decisions/0001-stack-monorepo-ts.md` | Viết lại theo NestJS + BullMQ. Thêm lại mục **Bối cảnh**: dự án học, mục tiêu middle–intermediate. **Lý do thật** là mục tiêu học (Nest và BullMQ phổ biến trong công việc Node, muốn tự gặp vấn đề dual-write); nói thẳng đây không phải quyết định do tải. **Hệ quả**: thêm Redis, `noeviction`, `/ready` kiểm cả Postgres lẫn Redis, dual-write xử lý bằng sweep job, deploy cần Redis managed. Ràng buộc NestJS như trên. Phương án đã cân nhắc: Hono + pg-boss (bản cũ). |
| `docs/roadmap.md` | Viết lại header (mục tiêu học, ước lượng **9–10 tuần**). Mỗi phase thay "Backend focus" bằng "🎓 Học được" và chỉnh "Tiêu chí hoàn thành" theo mức mới (chi tiết bên dưới). Sửa P3 cho khớp CLAUDE.md: `(extraction, staff, config, asOf)`, ngày là `YYYY-MM-DD`, bỏ "lưu UTC". Mục "Để sau MVP" thêm nhóm **Học nâng cao** chứa các kiến thức đã hạ. Bỏ "pg-boss" ở dòng Agent. |
| `docs/learning/README.md` (mới) | Cách dùng: progress là gì, ai tick, khi nào tick, cách ôn lại. |
| `docs/learning/progress.md` (mới) | Checklist theo phase, điền sẵn các mục "Học được" (chưa tick). |
| `docs/learning/notes/` (mới) | Mỗi chủ đề lớn có một note ngắn, Claude viết khi dạy (vd `p1-dual-write.md`). |
| `CLAUDE.md` | Sửa dòng `apps/api` (NestJS + BullMQ worker). Thêm mục **Chế độ dạy** (bên dưới). Thêm `docs/learning/` vào cấu trúc repo. |
| `.claude/commands/wrap.md` | Thêm bước: cập nhật `docs/learning/progress.md` với kiến thức mới trong phiên. |
| `docs/product.md` mục 8 | API: NestJS (Node); Job queue: BullMQ + Redis; thêm dòng Cache/queue store: Redis 7. |
| `README.md` | Dòng 3 (English summary) và dòng 28. |
| `docs/STATUS.md` | "Tiếp theo" đổi thành: plan 02 (dựng Nest + Redis), rồi Drizzle schema. Ghi nhật ký. |

### Roadmap mới: 🎓 Học được theo phase (bản tóm tắt, viết đầy đủ khi sửa file)

- **P0 · Nền tảng (4–5 ngày):** module / controller / provider và DI trong Nest; vòng đời request (middleware → guard → pipe → handler → filter); config từ env validate bằng Zod; Drizzle schema, migration, ràng buộc DB (FK, `NOT NULL`, `CHECK`, unique); Zod validation pipe; exception filter; `/health` và `/ready`; integration test với Postgres thật (supertest).
- **P1 · Lát cắt CPR (7–9 ngày):** upload file bằng stream, tính sha256 khi stream; dedupe bằng unique index; BullMQ queue, worker process riêng, concurrency; dual-write và sweep job; `attempts` / backoff của BullMQ; job idempotent; state machine đơn giản; gọi API ngoài với timeout (`AbortController`), phân biệt lỗi retry được và không retry được; parse output LLM bằng Zod.
- **P2 · Eval (5–6 ngày):** giới hạn concurrency (`p-limit`); cache theo hash; chạy tiếp sau khi bị ngắt; CLI script bằng Node.
- **P3 · Rule engine (3–4 ngày):** hàm thuần và dependency injection bằng tham số; test ca biên ngày tháng; viết SQL query có index, đọc `EXPLAIN` cơ bản.
- **P4 · Hàng chờ (5–6 ngày):** transaction nhiều bảng; optimistic locking; keyset pagination và so sánh với offset; bảng append-only (chặn ở tầng code).
- **P5 · Đủ 5 loại giấy (6–8 ngày):** log có cấu trúc với pino, gắn `requestId` / `documentId`, không log PII; đo thời gian từng bước; so sánh hai cách xử lý bằng số liệu.
- **P6 · Deploy (3–4 ngày):** secrets và env khi deploy; chạy migration lúc deploy; graceful shutdown (`enableShutdownHooks`, `worker.close()`); rate limit bằng `@nestjs/throttler`.

### Mục "Chế độ dạy" thêm vào CLAUDE.md

- Mỗi mục 🎓 trong roadmap là **phần học**. Trước khi code, Claude giải thích ngắn: vấn đề là gì, các cách giải, vì sao chọn cách này, lỗi hay gặp. Không quá một màn hình.
- Phần học làm theo từng bước nhỏ. Bạn tự code, hoặc Claude code từng đoạn và giải thích. Boilerplate thì Claude làm luôn.
- Xong một kiến thức, Claude thêm (hoặc cập nhật) dòng trong `progress.md`: tên kiến thức, file code liên quan, một câu hỏi tự kiểm. Chủ đề lớn có thêm note trong `docs/learning/notes/`.
- **Chỉ bạn tick** `[x]`, khi đã tự trả lời được câu hỏi tự kiểm mà không cần nhìn code. Claude không tự tick.
- Gặp kiến thức vượt mức middle thì Claude nói một câu là nó tồn tại, ghi vào "Học nâng cao", rồi làm tiếp bằng cách đơn giản.

### Format một dòng trong `progress.md`

```markdown
## P1 · Lát cắt CPR

- [ ] **Dual-write và sweep job** · `apps/api/src/documents/upload.service.ts` · note: `notes/p1-dual-write.md`
  - Tự kiểm: Nếu `queue.add` lỗi sau khi đã commit document thì document đó được xử lý lại bằng cách nào?
```

## Contract / config / prompt bị ảnh hưởng

Không. ADR 0001 và roadmap là quyết định kiến trúc, cần duyệt.

## Test và cách kiểm tra

- `grep -rni "hono\|pg-boss"` trong docs, README, CLAUDE.md chỉ còn kết quả ở mục "Phương án đã cân nhắc" của ADR.
- `pnpm exec prettier --check .` pass. Sửa luôn dấu cách thừa ở `docs/case-study.md`.
- Đọc chéo: mỗi mục 🎓 trong roadmap có dòng tương ứng trong `progress.md`; P3 khớp với nguyên tắc rule engine trong CLAUDE.md.

## Tiêu chí xong

- [x] ADR 0001 mới có đủ: Bối cảnh, lý do thật, hệ quả (Redis, `noeviction`, dual-write, `/ready`, deploy), ràng buộc NestJS.
- [x] Roadmap P0–P6 có "🎓 Học được" mức middle; kiến thức nâng cao nằm ở "Học nâng cao", không mất.
- [x] `docs/learning/` có README, progress điền sẵn theo phase, thư mục notes.
- [x] CLAUDE.md có mục Chế độ dạy; `/wrap` cập nhật progress.
- [x] Không còn chỗ nào ghi Hono / pg-boss là stack hiện tại.

## Rủi ro / câu hỏi

1. ~~Hạn chót?~~ Không có hạn chót → giữ đủ 5 loại giấy, ước lượng 9–10 tuần.
2. **Sweep job thay cho outbox** là đánh đổi có chủ đích: đơn giản hơn, nhưng vẫn có cửa sổ trễ tối đa N phút. Ghi rõ trong ADR để reviewer thấy bạn hiểu giới hạn.
3. ~~Ai code phần học?~~ Liam tự code, Claude hướng dẫn.

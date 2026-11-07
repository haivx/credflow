# Roadmap

> Nguồn sự thật về kế hoạch. Tiến độ hằng ngày ghi ở `docs/STATUS.md`, plan từng task ở `docs/plans/`.
> Mỗi phase: mục tiêu · phạm vi · 🎓 học được · tiêu chí hoàn thành · phụ thuộc. Phase chỉ xong khi đạt **đủ** tiêu chí.
> **Mục tiêu cá nhân:** vừa build CredFlow vừa lên mức middle–intermediate Node.js. Mỗi mục 🎓 là kiến thức gắn với phase đó, **không còn bắt buộc tự code** (từ 2026-11-05 Claude code toàn bộ plan, Liam duyệt plan và PR; xem mục "Quyết định đáng nhớ" trong `CLAUDE.md`). `docs/learning/` giữ làm lưu trữ.
> Kiến thức vượt mức middle được ghi ở mục **Học nâng cao** cuối file, không làm trong MVP.
> Ước lượng: 9–10 tuần, không có hạn chót. Ưu tiên hiểu chắc hơn làm nhanh.
> **Thứ tự làm (Liam 2026-11-07):** P0 → P1 → P2 → P3 → P4 → P4.5 → **P6a (deploy Railway)** → P5 → P6b. P6a nằm cuối file cạnh P6b cho dễ đọc.

## P0 · Nền tảng và contract (4–5 ngày)

- **Trạng thái:** Xong 2026-11-03 (plan 02–09).
- **Mục tiêu:** chốt contract và stack; API NestJS, worker, Postgres, Redis chạy được.
- **Phạm vi:**
  - Liam review và chốt `packages/contracts` (đang là bản nháp), `docs/doc-types.md`, các quyết định còn mở ở `docs/product.md` mục 8.
  - Dựng `apps/api` bằng NestJS (hai entrypoint `main.ts`, `worker.ts`), docker compose thêm Redis (`noeviction`). Xem ADR 0001.
  - Drizzle + schema DB đầu tiên (`documents`, `staff`, `review_actions`), migration, seed staff giả lập.
  - API: `GET /health`, `GET /ready`, `GET /staff`.
- **🎓 Học được:**
  - Nest cơ bản: module, controller, provider, DI; custom provider (token `DB` cho Drizzle).
  - Vòng đời request trong Nest: middleware → guard → pipe → handler → interceptor → exception filter.
  - Config từ env validate bằng Zod; thiếu biến thì app không khởi động.
  - Drizzle: schema, migration, query cơ bản. Ràng buộc ở DB: FK, `NOT NULL`, `CHECK`, unique index (vd `documents.checksum`).
  - Zod validation pipe và exception filter trả lỗi một format `{ code, message, details? }`.
  - `/health` (process còn sống) khác `/ready` (Postgres và Redis dùng được) thế nào.
  - Integration test với Postgres thật (DB test trong docker compose) bằng supertest.
- **Tiêu chí hoàn thành:** `make setup && make dev` chạy trên máy sạch; `make test`, `make typecheck`, `make lint` pass; `/ready` trả lỗi khi tắt Redis; có ít nhất 1 integration test dùng Postgres thật; insert vi phạm constraint bị DB từ chối (có test).
- **Phụ thuộc:** không.

## P1 · Lát cắt dọc cho thẻ CPR (7–9 ngày)

- **Mục tiêu:** một loại giấy đi trọn từ upload đến kết quả. Biết sớm độ khó thật nằm ở đâu.
- **Phạm vi:** đăng nhập cơ bản (email + mật khẩu, session, 3 vai trò; ADR 0004; màn login gộp với màn upload) → upload một file (API + màn upload tối giản) → job → phân loại → trích xuất CPR kèm evidence → rule cho CPR (`MISSING_FIELD`, `MISSING_EVIDENCE`, `LOW_CONFIDENCE`, `DATE_INCONSISTENT`, `EXPIRED`, `EXPIRING_SOON`, `NAME_MISMATCH`, `ISSUER_NOT_ACCEPTED`) → routing → hiển thị kết quả dạng thô. Chốt model LLM (ADR). Prompt có version.
- **🎓 Học được:**
  - **Đăng nhập cơ bản:** lưu mật khẩu bằng hash có salt (`crypto.scrypt`), vì sao không dùng sha256 cho mật khẩu; session lưu ở DB so với JWT; cookie `httpOnly`, `SameSite`, `Secure`; guard toàn cục + metadata (`@Public`, `@Roles`) đọc bằng `Reflector`; 401 khác 403.
  - **Stream:** nhận file upload bằng stream, tính sha256 trong lúc stream, ghi file qua interface storage (local trước, S3 sau). Vì sao không đọc cả file vào memory.
  - **Dedupe upload:** unique index trên checksum; upload lại cùng file trả về cùng `documentId`.
  - **BullMQ:** queue, worker chạy process riêng, `concurrency`, `attempts` + backoff, job lỗi đi đâu.
  - **Dual-write:** commit DB rồi mới `queue.add` với `jobId = documentId`; sweep job (repeatable) đẩy lại document kẹt ở `uploaded`, còn `processing` quá hạn không còn job sống thì chuyển người duyệt (ADR 0007). Hiểu vì sao không gói được trong một transaction, và giới hạn của cách này.
  - **Job idempotent:** worker kiểm trạng thái trước khi chạy; ghi kết quả bằng `UPDATE ... WHERE status = from`, chạy trùng thì chỉ một bên thắng (ADR 0007).
  - **State machine đơn giản:** `uploaded → processing → extracted → needs_review | auto_approved | failed`, một hàm kiểm transition hợp lệ, cộng `CHECK` ở DB.
  - **Gọi service ngoài (LLM):** timeout bằng `AbortController`; lỗi nào retry được (timeout, 429, 5xx), lỗi nào không (400, parse lỗi quá số lần); hết retry thì document sang `needs_review` kèm ghi chú, chỉ file hỏng mới `failed` (ADR 0006).
  - Parse output LLM bằng Zod; parse lỗi → retry giới hạn → `needs_review`.
- **Tiêu chí hoàn thành:** 5 thẻ CPR giả lập làm tay (≥ 3 bố cục khác nhau) chạy đúng end-to-end; output LLM luôn parse qua Zod; rule engine có unit test cho từng mã rule; mỗi document lưu `versions` và `timingMs`; route không gắn `@Public` mà chưa đăng nhập thì 401, sai vai trò thì 403 (có test); upload cùng file 2 lần chỉ tạo 1 document (có test); chạy cùng một job 2 lần không sinh dữ liệu trùng (có test); giả lập `queue.add` lỗi thì sweep job vẫn đưa document đi xử lý (có test); LLM giả lập lỗi 50% thì không document nào kẹt ở `processing`.
- **Phụ thuộc:** P0.

## P2 · Dữ liệu giả lập và eval baseline (5–6 ngày)

> **Xong 2026-11-06** (plan 18–22): synth có seed, `make eval` + report, baseline, cổng `eval-ci` trong CI (`falseApproveRate` dev 0/40), 10 ca khó làm tay.

- **Mục tiêu:** có số liệu đầu tiên; từ đây mọi thay đổi đi qua `make eval`.
- **Phạm vi:** `tools/synth`: template HTML cho CPR (3–5 bố cục, tham khảo `docs/research/layout-notes.md`), render PNG/PDF, nhiễu (xoay, mờ, chụp lệch, nén JPEG), sinh `GoldenCase` có seed. `eval/`: chạy pipeline trên golden set, tính `EvalMetrics` + cắt theo tag, ghi `eval/runs/` và `eval/report.md`, so với lần trước. Chia dev/holdout. 10 ca khó làm tay trong `eval/hard-cases/`.
- **🎓 Học được:**
  - Viết CLI script bằng Node: đọc tham số, exit code, log tiến độ.
  - Chạy song song có giới hạn (`p-limit`), so sánh với `Promise.all` không giới hạn; tôn trọng rate limit của provider.
  - Random có seed để sinh lại đúng cùng dữ liệu.
  - Cache kết quả LLM theo `(fileHash, promptVersion, model)`, chỉ đổi rule thì không gọi LLM lại.
  - Chạy tiếp được sau khi bị ngắt: ghi kết quả từng ca, bỏ qua ca đã xong.
- **Tiêu chí hoàn thành:** `make synth SEED=1` sinh lại đúng cùng bộ dữ liệu; `make eval` sinh `report.md` tự động; có baseline CPR ghi trong `docs/STATUS.md`; chạy lại eval chỉ đổi rule thì 0 lời gọi LLM mới; report ghi tổng thời gian và chi phí ước tính của run.
- **Phụ thuộc:** P1.

## P3 · Rule engine đầy đủ và routing (3–4 ngày)

> **Xong 2026-11-06** (plan 23–26): check vùng kiến trúc theo plan, ngày dạng thứ tự, config theo khách hàng + `dateOrder` (ADR 0011), `GET /staff/:id/compliance` với index và `EXPLAIN`. `RESULT_NOT_PASSING` đi cùng TB test/background check ở P5.

- **Mục tiêu:** rule cấu hình được theo khách hàng, routing an toàn.
- **Phạm vi:** đủ 10 mã rule; chuẩn hoá và so khớp tên; tính hạn khi không in sẵn; nhiều file config theo khách hàng; yêu cầu bộ giấy theo vai trò (staff đã đủ bộ chưa).
- **🎓 Học được:**
  - Hàm thuần `(extraction, staff, config, asOf) → RuleResult[]`: vì sao truyền `asOf` vào thay vì gọi `Date.now()`, và vì sao nhờ vậy test được hoàn toàn.
  - Ngày lịch là chuỗi `YYYY-MM-DD`; vì sao `Date` dễ lệch múi giờ; xử lý ca biên (cuối tháng, năm nhuận).
  - Đọc và validate config YAML bằng Zod khi khởi động; mỗi kết quả ghi `rules` version đã dùng.
  - Viết query SQL "staff đã đủ bộ giấy chưa" (JOIN, GROUP BY), thêm index, đọc `EXPLAIN` cơ bản (Seq Scan và Index Scan).
  - Giữ ranh giới package bằng ESLint `no-restricted-imports`.
- **Tiêu chí hoàn thành:** test cho mọi mã rule kể cả ca biên (ngày cuối tháng, năm nhuận, "LAST, FIRST"); `falseApproveRate = 0` trên golden set dev của CPR; config sai schema bị từ chối khi khởi động; `packages/rules` không import gì từ DB/HTTP/Nest (lint chặn); query đủ bộ giấy dùng index (có `EXPLAIN` trong plan).
- **Phụ thuộc:** P2 (cần eval để đo).

## P4 · Hàng chờ và màn duyệt (5–6 ngày)

> **Xong 2026-11-07** (plan 27–29): API duyệt (optimistic lock, keyset, chỉ insert `review_actions`), UI S2/S3, `make report-corrections`, 10 ca thật chỉ bằng UI (evidence `.verify/reports/2026-11-07-29-bao-cao-10-ca.md`). Chưa làm: highlight `box` (P5); 30 giây/ca của người đo ở lượt kiểm tay cuối.

- **Mục tiêu:** người duyệt xử lý một ca trong dưới 30 giây.
- **Phạm vi:** hàng chờ (lọc theo lý do, sắp theo hạn); màn duyệt (ảnh + trường + evidence + rule không qua); sửa trường inline; duyệt / từ chối / yêu cầu nộp lại; lưu `ReviewAction` có `corrections`; trạng thái phía nhân viên. Highlight vùng chữ khi có `box`.
- **🎓 Học được:**
  - Transaction nhiều bảng: duyệt cập nhật `documents` và ghi `review_actions` cùng lúc, lỗi giữa chừng thì rollback; truyền `tx` qua nhiều service.
  - **Optimistic locking** bằng cột `version`: `UPDATE … WHERE id = ? AND version = ?`, không có dòng nào bị ảnh hưởng thì trả `409 Conflict`.
  - Pagination: offset và keyset `(dueDate, id)`, vì sao keyset ổn định hơn khi dữ liệu thay đổi.
  - `review_actions` chỉ insert (repository không có hàm update/delete).
  - Stream file ảnh qua endpoint có kiểm quyền.
- **Tiêu chí hoàn thành:** xử lý trọn 10 ca trong hàng chờ chỉ bằng UI; mọi chỗ sửa xuất hiện trong `review_actions`; báo cáo "trường hay bị sửa nhất" chạy được từ dữ liệu đó; test gửi 2 request duyệt cùng `version` thì đúng 1 thành công, request còn lại nhận `409`.
- **Phụ thuộc:** P3.

## P4.5 · Dựng UI (4–5 ngày)

> Thêm 2026-11-07 (Liam): P1 và P4 chỉ có UI tối giản để chạy được luồng; `apps/web` chưa dùng Tailwind, shadcn/ui, TanStack Query như ADR 0001 đã chốt.

- **Mục tiêu:** S1, S2, S3 đủ rõ và đẹp để người duyệt làm việc thật và để quay demo, đúng stack của ADR 0001. Không đổi API, contract, rule.
- **Phạm vi:**
  - Nền: Tailwind + shadcn/ui; TanStack Query thay polling và fetch viết tay; layout chung (header, điều hướng theo vai trò), badge trạng thái, toast, trạng thái đang tải / rỗng / lỗi.
  - S1: kéo thả file, trạng thái từng giấy dễ đọc, lý do của người duyệt nổi rõ.
  - S2, S3: ảnh bên trái, trường bên phải, chữ gốc sát giá trị, rule không qua nổi bật, loại giấy + confidence (phân biệt "không nhận ra loại giấy" với "chưa có rule cho loại này"), phím tắt duyệt nhanh.
  - Sửa: giấy đã duyệt không còn hiện lý do vào hàng chờ (vd `LOW_CONFIDENCE`) ở màn staff.
  - Ngoài: S4, S5 (P5, dùng lại layout của phase này); highlight `box` (P5); đổi ngôn ngữ / i18n (P6).
- **Thiết kế:** Claude tự thiết kế bằng component shadcn, tông trung tính; mỗi plan có screenshot để Liam duyệt.
- **🎓 Học được:**
  - Server Component và Client Component trong App Router: phần nào chạy ở server, phần nào cần `"use client"`.
  - TanStack Query: query key, cache, `refetchInterval` thay polling tay, mutation + invalidate sau khi duyệt.
  - Tailwind và design token (màu, khoảng cách) dùng chung; component có biến thể (`cva` của shadcn).
  - Form có kiểm tra phía client nhưng server vẫn là nơi quyết định (Zod của `packages/contracts` dùng ở cả hai phía).
  - Accessibility cơ bản: label, focus, điều khiển bằng bàn phím.
- **Tiêu chí hoàn thành:** S1, S2, S3 dùng Tailwind + shadcn, không còn style inline; screenshot desktop và bề ngang điện thoại của cả 3 màn trong evidence; lượt 10 ca bằng `ui.mts` (plan 29) chạy lại vẫn qua, testid giữ nguyên; duyệt được một ca hoàn toàn bằng bàn phím; không đổi API, contract (`git diff` không chạm `packages/contracts`, `apps/api`).
- **Phụ thuộc:** P4.

## P5 · Đủ 5 loại giấy và ca khó (6–8 ngày)

- **Mục tiêu:** phủ đủ phạm vi MVP với số liệu đáng tin.
- **Phạm vi:** template + prompt + rule cho `professional_license`, `tb_test`, `background_check`, `vaccination_record`; ca khó theo `docs/doc-types.md`; dashboard hết hạn (admin). Thử nghiệm so sánh vision thuần với OCR + LLM, quyết bằng ADR.
- **🎓 Học được:**
  - Log có cấu trúc bằng pino (`nestjs-pino`): mỗi dòng log có `requestId`, `documentId`; không log PII.
  - Truyền `documentId` từ API sang worker qua job data để nối log hai process.
  - Đo thời gian từng bước, lưu `timingMs`, tính p95 bằng SQL.
  - Mở rộng code cho loại giấy mới mà không sửa lung tung (một chỗ đăng ký loại giấy).
- **Tiêu chí hoàn thành:** đạt chỉ số MVP ở `docs/product.md` mục 1 trên **holdout**; report có bảng theo loại giấy và theo tag; lọc log theo `documentId` thấy đủ hành trình của một document; có số liệu p95 thời gian xử lý mỗi document và chi phí trung bình mỗi document trong `docs/STATUS.md`.
- **Phụ thuộc:** P4.5, P6a.

## P6a · Deploy lên Railway (4–6 ngày)

> Thêm 2026-11-07 (Liam): tách P6 làm hai, deploy làm ngay sau P4.5 (trước P5) để các phase sau deploy liên tục. Nền tảng: ADR 0013. Liam tự thao tác Railway theo bài hướng dẫn từng bước; Claude code phần app cần đổi.

- **Mục tiêu:** CredFlow chạy trên Railway với link HTTPS, deploy tự động khi merge `main` (sau CI xanh), không mất job khi deploy lại; Liam dùng Railway thành thạo cho các app sau.
- **Phạm vi:**
  - Hạ tầng (Liam): project, Postgres, Redis (`noeviction`), Bucket; service `api`, `worker`, `web` từ monorepo (build/start command, watch paths, Wait for CI); biến môi trường bằng reference variable; chỉ `web` công khai; migration bằng pre-deploy; seed một lần với mật khẩu riêng.
  - Code (Claude): `S3Storage` + `STORAGE_DRIVER` (plan 33); seed đọc `SEED_PASSWORD`, từ chối mật khẩu dev trên database không phải local (plan 33).
  - Vận hành: Hobby + Usage Limits, trần chi tiêu Anthropic, rate limit (`@nestjs/throttler`), tự xoá file sau N giờ, backup Postgres và thử khôi phục, deploy lại khi có job đang chạy không mất job, staging environment, cấu hình bằng code (`.railway/railway.ts`).
- **🎓 Học được:**
  - Mô hình Railway: project, service, environment, deployment, variables; mạng nội bộ; volume chỉ gắn một service; bucket.
  - Build và start tách riêng; watch paths cho monorepo; staged changes và xem lại trước khi deploy.
  - Secrets và env khi deploy: không nằm trong repo; reference variable; giới hạn chi tiêu API key LLM.
  - Chạy migration khi deploy, trước khi app mới nhận traffic; healthcheck và zero-downtime deploy.
  - Graceful shutdown: `app.enableShutdownHooks()`, `worker.close()` chờ job đang chạy xong.
  - Rate limit theo IP bằng `@nestjs/throttler`.
  - Backup và **thử khôi phục**.
- **Tiêu chí hoàn thành:** link demo HTTPS hoạt động; merge `main` thì tự deploy; deploy bản mới trong lúc có job đang chạy không làm mất job; demo công khai bị chặn khi vượt rate limit; có backup đã thử khôi phục; cấu hình Railway nằm trong repo để dựng lại được.
- **Phụ thuộc:** P4 (P4.5 nên xong trước để demo có UI mới, nhưng không chặn).

## P6b · Writeup, demo (2–3 ngày)

- **Mục tiêu:** người lạ mở link là hiểu và dùng thử được.
- **Phạm vi:** README tiếng Anh; `docs/case-study.md` hoàn chỉnh (vấn đề → kiến trúc → trade-off → số liệu eval → giới hạn); video demo 3 phút.
- **🎓 Học được:**
  - Case study có mục "Quyết định backend": dual-write + sweep job, dedupe, optimistic locking, kèm giới hạn và cách nâng cấp.
- **Tiêu chí hoàn thành:** máy mới clone, điền `.env`, `make setup && make dev` là chạy; case study có bảng số liệu holdout; video demo trên link thật.
- **Phụ thuộc:** P5, P6a.

## Để sau MVP

Agent (xem `docs/product.md` mục 9), nhắc gia hạn, nhiều tenant, đăng nhập thật, audit log đầy đủ.

**Tính năng** (theo thứ tự ưu tiên):

1. **SSO/OIDC:** thay đăng nhập email + mật khẩu của MVP (ADR 0004); giữ nguyên guard và vai trò.
2. **Nhắc gia hạn:** job định kỳ nhắc trước 60/30/7 ngày, chạy lại không gửi trùng.
3. **Nhiều tenant:** mỗi bảng có `tenantId`, test chứng minh tenant A không đọc được dữ liệu tenant B.
4. **Audit log đầy đủ.**
5. **Agent:** chạy *bên trong* pipeline BullMQ (queue lo độ tin cậy, agent lo suy luận), có human-in-the-loop.

## Học nâng cao

Vượt mức middle; mỗi mục ghi chỗ trong CredFlow sẽ cần nó. Làm khi xong MVP.

| Kiến thức | Thay cho cách đang dùng | Chỗ dùng |
| --- | --- | --- |
| Transactional outbox + relay (polling, LISTEN/NOTIFY, CDC), dedupe khi nhiều relay | Commit rồi `queue.add` + sweep job | P1 upload |
| AsyncLocalStorage / `nestjs-cls` transactional | Truyền `tx` tường minh | Mọi service |
| `SELECT … FOR UPDATE SKIP LOCKED` + lease "nhận ca" | Optimistic locking | P4 hàng chờ |
| Header `Idempotency-Key` | Dedupe theo checksum | P1 upload |
| Dedupe theo `(staff_id, checksum)`, không lộ "file đã có người nộp" | Checksum unique toàn cục, staff khác → 409 (ADR 0005) | P1 upload |
| Upload thẳng lên S3 bằng presigned URL, dọn file mồ côi định kỳ | Stream qua API xuống đĩa local | P1 upload, P6 deploy |
| OIDC/SSO, refresh token, xoay session | Email + mật khẩu, session cố định 7 ngày | P1 đăng nhập |
| CSRF token (double-submit) | `SameSite=Lax` + API chỉ nhận JSON | P1 đăng nhập |
| Token riêng cho agent (fine-grained PAT, không admin, không merge) | Claude dùng chung token `gh` admin của Liam, chặn bằng deny rule theo chữ (plan 12f) | Quy trình agent, guardrail A8 |
| Chặn brute-force login (khoá tạm, rate limit theo tài khoản) | Chưa chặn; rate limit theo IP ở P6 | P1 đăng nhập |
| Testcontainers | DB test trong docker compose | Integration test |
| OpenTelemetry trace + metrics | pino + `timingMs` | P5 |
| Load test (k6), tìm bottleneck | — | P5 |
| RFC 9457 Problem Details | `{ code, message, details? }` | Lỗi API |
| Presigned URL | Endpoint stream file | P4, khi có S3 |
| SSE/WebSocket đẩy trạng thái document về trình duyệt | Polling `GET /documents` 2 giây, dừng sau 2 phút | P1 màn upload (plan 17) |
| Component test / visual regression (Storybook, Chromatic) | Screenshot `ui.mts` trong evidence, Liam nhìn | P4.5 UI |
| Optimistic update, prefetch ở server (`HydrationBoundary`) của TanStack Query | Mutation xong thì invalidate, fetch ở client | P4.5 UI (plan 30) |
| E2E UI tự động trong CI (Playwright test) | Kiểm L3 tay bằng Playwright MCP, screenshot vào evidence | P1 màn upload (plan 17) |
| Bảng append-only bằng trigger/quyền DB, hash chain | Chặn ở tầng code | Audit log |
| Cursor phân trang có ký (HMAC) | Cursor base64 JSON không ký, kiểm bằng Zod | P4 hàng chờ (plan 27) |
| Cột tính sẵn (generated column) cho khoá hạn theo từng loại giấy | Biểu thức jsonb `expirationDate` + expression index | P4 hàng chờ, P5 thêm loại giấy |
| Postgres Row-Level Security | Lọc `tenantId` ở query | Nhiều tenant |
| Migration expand/contract không downtime | Migration trước khi deploy | P6 |
| Redis AOF, HA | Chấp nhận mất, sweep job | Vận hành |
| Webhook ký HMAC + retry, circuit breaker | — | Tích hợp ngoài |

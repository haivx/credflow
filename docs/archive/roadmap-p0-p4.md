# Roadmap P0–P4 (bản đầy đủ)

> Nguyên văn các phase đã xong, chuyển khỏi `docs/roadmap.md` ở plan 37 (2026-11-08). Mục tiêu, phạm vi, 🎓 học được, tiêu chí hoàn thành của từng phase nằm ở đây.

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

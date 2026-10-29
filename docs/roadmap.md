# Roadmap

> Nguồn sự thật về kế hoạch. Tiến độ hằng ngày ghi ở `docs/STATUS.md`, plan từng task ở `docs/plans/`.
> Mỗi phase: mục tiêu · phạm vi · backend focus · tiêu chí hoàn thành · phụ thuộc. Phase chỉ xong khi đạt **đủ** tiêu chí.
> **Backend focus** là phần kỹ năng backend gắn vào phase đó: tự viết ADR/contract, phần cốt lõi tự code hoặc đọc hiểu từng dòng, phần còn lại giao Claude Code.
> Ước lượng tổng: 6–7 tuần (5–6 tuần sản phẩm + khoảng 1 tuần cho backend focus).

## P0 · Nền tảng và contract (2–3 ngày)

- **Mục tiêu:** chốt contract và stack, monorepo chạy được.
- **Phạm vi:**
  - Liam review và chốt `packages/contracts` (đang là bản nháp), `docs/doc-types.md`, các quyết định còn mở ở `docs/product.md` mục 8.
  - ADR 0001 chuyển từ "Đề xuất" sang "Chấp nhận" (hoặc sửa).
  - Thêm Drizzle + schema DB đầu tiên (`documents`, `staff`, `review_actions`), migration, pg-boss.
  - API: route `GET /health`, `GET /staff` (dữ liệu seed giả lập).
- **Backend focus:**
  - Ràng buộc nằm ở DB, không chỉ ở code: FK, `NOT NULL`, `CHECK` cho cột trạng thái, unique index cho `documents.checksum`.
  - Config đọc từ env, validate bằng Zod, thiếu biến thì fail ngay khi khởi động.
  - Tách `GET /health` (liveness) và `GET /ready` (kiểm Postgres, pg-boss).
  - Một format lỗi thống nhất cho mọi API (RFC 9457 Problem Details).
  - Integration test chạy với Postgres thật qua Testcontainers, không mock DB.
- **Tiêu chí hoàn thành:** `make setup && make dev` chạy trên máy sạch; `make test`, `make typecheck`, `make lint` pass; ADR 0001 ở trạng thái Chấp nhận; có ít nhất 1 integration test dùng Postgres thật; insert vi phạm constraint bị DB từ chối (có test).
- **Phụ thuộc:** không.

## P1 · Lát cắt dọc cho thẻ CPR (5–7 ngày)

- **Mục tiêu:** một loại giấy đi trọn từ upload đến kết quả. Biết sớm độ khó thật nằm ở đâu.
- **Phạm vi:** upload một file (API + màn upload tối giản) → job → phân loại → trích xuất CPR kèm evidence → rule cho CPR (`MISSING_FIELD`, `MISSING_EVIDENCE`, `LOW_CONFIDENCE`, `DATE_INCONSISTENT`, `EXPIRED`, `EXPIRING_SOON`, `NAME_MISMATCH`, `ISSUER_NOT_ACCEPTED`) → routing → hiển thị kết quả dạng thô. Chốt model LLM (ADR). Prompt có version.
- **Backend focus:**
  - **Transactional enqueue:** ghi `documents` và tạo job pg-boss trong cùng một transaction. ADR giải thích vì sao cách này không cần outbox, và khi nào vẫn phải dùng outbox (queue nằm ngoài Postgres).
  - **Upload idempotent:** hỗ trợ header `Idempotency-Key` và dedupe theo checksum; gửi lại cùng file trả về cùng `documentId`, không tạo job mới.
  - **State machine cho document:** `uploaded → processing → extracted → needs_review | auto_approved | failed`, chặn transition sai ở code và DB.
  - **Job an toàn khi chạy lại:** mỗi bước ghi kết quả bằng upsert theo `(documentId, step, version)`, chạy 2 lần không sinh dữ liệu trùng.
  - **Gọi LLM như gọi service ngoài:** có timeout, retry giới hạn với backoff + jitter, phân loại lỗi retry được / không retry được, lỗi cuối cùng chuyển document sang `failed` kèm lý do.
  - File lưu qua interface storage (local/S3) và đọc bằng stream, không load cả file vào memory.
- **Tiêu chí hoàn thành:** 5 thẻ CPR giả lập làm tay (≥ 3 bố cục khác nhau) chạy đúng end-to-end; output LLM luôn parse qua Zod; rule engine có unit test cho từng mã rule; mỗi document lưu `versions` và `timingMs`; upload cùng file 2 lần chỉ tạo 1 document (có test); kill worker giữa chừng rồi chạy lại thì document vẫn xử lý xong đúng 1 lần; LLM giả lập lỗi 50% thì không document nào kẹt ở `processing`; có ADR về transactional enqueue.
- **Phụ thuộc:** P0.

## P2 · Dữ liệu giả lập và eval baseline (5–6 ngày)

- **Mục tiêu:** có số liệu đầu tiên; từ đây mọi thay đổi đi qua `make eval`.
- **Phạm vi:** `tools/synth`: template HTML cho CPR (3–5 bố cục, tham khảo `docs/research/layout-notes.md`), render PNG/PDF, nhiễu (xoay, mờ, chụp lệch, nén JPEG), sinh `GoldenCase` có seed. `eval/`: chạy pipeline trên golden set, tính `EvalMetrics` + cắt theo tag, ghi `eval/runs/` và `eval/report.md`, so với lần trước. Chia dev/holdout. 10 ca khó làm tay trong `eval/hard-cases/`.
- **Backend focus:**
  - Eval chạy song song có giới hạn concurrency (cấu hình được), tôn trọng rate limit của LLM provider.
  - Mỗi eval run có `runId`, lưu đủ version (prompt, model, rule config, dataset seed) để tái lập.
  - Cache kết quả LLM theo `(fileHash, promptVersion, model)` để chạy lại eval không tốn tiền khi chỉ đổi rule.
  - Eval chạy dở bị ngắt thì chạy tiếp được, không làm lại từ đầu.
- **Tiêu chí hoàn thành:** `make synth SEED=1` sinh lại đúng cùng bộ dữ liệu; `make eval` sinh `report.md` tự động; có baseline CPR ghi trong `docs/STATUS.md`; chạy lại eval chỉ đổi rule thì 0 lời gọi LLM mới; report ghi tổng thời gian và chi phí ước tính của run.
- **Phụ thuộc:** P1.

## P3 · Rule engine đầy đủ và routing (3–4 ngày)

- **Mục tiêu:** rule cấu hình được theo khách hàng, routing an toàn.
- **Phạm vi:** đủ 10 mã rule; chuẩn hoá và so khớp tên; tính hạn khi không in sẵn; nhiều file config theo khách hàng; yêu cầu bộ giấy theo vai trò (staff đã đủ bộ chưa).
- **Backend focus:**
  - Rule engine là pure function `(extraction, config, now) → RuleResult[]`, không đụng DB hay đồng hồ hệ thống, nên test được hoàn toàn.
  - Thời gian xử lý nhất quán: lưu UTC, so sánh ngày theo timezone của khách hàng trong config, inject `now` để test.
  - Config theo khách hàng có schema + version; mỗi kết quả routing ghi lại `configVersion` đã dùng.
  - "Staff đã đủ bộ giấy chưa" tính bằng một query rõ ràng, có index phù hợp, kiểm bằng `EXPLAIN ANALYZE` trên dữ liệu seed lớn.
- **Tiêu chí hoàn thành:** test cho mọi mã rule kể cả ca biên (ngày cuối tháng, năm nhuận, "LAST, FIRST"); `falseApproveRate = 0` trên golden set dev của CPR; config sai schema bị từ chối khi khởi động; rule engine không import gì từ tầng DB/HTTP (kiểm bằng lint rule hoặc dependency-cruiser); query đủ bộ giấy chạy dưới 50 ms với 10.000 staff seed.
- **Phụ thuộc:** P2 (cần eval để đo).

## P4 · Hàng chờ và màn duyệt (5–6 ngày)

- **Mục tiêu:** người duyệt xử lý một ca trong dưới 30 giây.
- **Phạm vi:** hàng chờ (lọc theo lý do, sắp theo hạn); màn duyệt (ảnh + trường + evidence + rule không qua); sửa trường inline; duyệt / từ chối / yêu cầu nộp lại; lưu `ReviewAction` có `corrections`; trạng thái phía nhân viên. Highlight vùng chữ khi có `box`.
- **Backend focus:**
  - **Hai người duyệt cùng một ca:** "nhận ca" bằng `SELECT … FOR UPDATE SKIP LOCKED` (có thời hạn giữ ca), hành động duyệt dùng optimistic locking (cột `version`). ADR so sánh hai cách.
  - Hàng chờ dùng keyset pagination theo `(dueDate, id)`, có index tương ứng.
  - `review_actions` chỉ được insert, không update/delete (quyền DB hoặc trigger), là nền cho audit log sau MVP.
  - Duyệt/từ chối cập nhật document và ghi `review_actions` trong một transaction.
  - Presigned URL để xem ảnh có thời hạn ngắn, kiểm quyền trước khi cấp.
- **Tiêu chí hoàn thành:** xử lý trọn 10 ca trong hàng chờ chỉ bằng UI; mọi chỗ sửa xuất hiện trong `review_actions`; báo cáo "trường hay bị sửa nhất" chạy được từ dữ liệu đó; test bắn 20 request duyệt song song cùng một ca thì đúng 1 thành công, còn lại nhận lỗi conflict rõ ràng; 2 reviewer mở hàng chờ cùng lúc không nhận trùng ca.
- **Phụ thuộc:** P3.

## P5 · Đủ 5 loại giấy và ca khó (6–8 ngày)

- **Mục tiêu:** phủ đủ phạm vi MVP với số liệu đáng tin.
- **Phạm vi:** template + prompt + rule cho `professional_license`, `tb_test`, `background_check`, `vaccination_record`; ca khó theo `docs/doc-types.md`; dashboard hết hạn (admin). Thử nghiệm so sánh vision thuần với OCR + LLM, quyết bằng ADR.
- **Backend focus:**
  - OpenTelemetry trace một document xuyên suốt: upload → job → từng bước pipeline → rule → routing; log có `traceId`, `documentId`, không log PII.
  - Metrics: thời gian chờ queue, thời gian từng bước, tỉ lệ lỗi theo bước, số token và chi phí mỗi document.
  - Load test (k6 hoặc script): upload 500 document liên tục, tìm bottleneck đầu tiên và ghi lại trước/sau khi sửa.
  - Dashboard hết hạn dùng query có index, kiểm bằng `EXPLAIN ANALYZE`.
- **Tiêu chí hoàn thành:** đạt chỉ số MVP ở `docs/product.md` mục 1 trên **holdout**; report có bảng theo loại giấy và theo tag; từ một document chậm tìm ra bước gây chậm chỉ bằng trace; có số liệu p95 thời gian xử lý mỗi document và chi phí trung bình mỗi document trong `docs/STATUS.md`.
- **Phụ thuộc:** P4.

## P6 · Deploy, writeup, demo (3–4 ngày)

- **Mục tiêu:** người lạ mở link là hiểu và dùng thử được.
- **Phạm vi:** deploy demo (dữ liệu giả lập, có giới hạn chi phí); README tiếng Anh; `docs/case-study.md` hoàn chỉnh (vấn đề → kiến trúc → trade-off → số liệu eval → giới hạn); video demo 3 phút.
- **Backend focus:**
  - Secrets không nằm trong repo hay image; API key LLM có giới hạn chi tiêu phía provider.
  - Migration chạy tự động trong pipeline deploy trước khi app mới nhận traffic; viết migration theo kiểu expand/contract.
  - Worker tắt an toàn khi deploy (graceful shutdown, không bỏ dở job).
  - Rate limit cho API demo công khai (theo IP) để chặn lạm dụng chi phí LLM.
  - Case study có mục "Quyết định backend": transactional enqueue, idempotency, xử lý duyệt đồng thời, trace pipeline, kèm số liệu đo được.
- **Tiêu chí hoàn thành:** máy mới clone, điền `.env`, `make setup && make dev` là chạy; link demo hoạt động; case study có bảng số liệu holdout; deploy bản mới trong lúc có job đang chạy không làm mất job; demo công khai bị chặn khi vượt rate limit.
- **Phụ thuộc:** P5.

## Để sau MVP

Agent (xem `docs/product.md` mục 9), nhắc gia hạn, nhiều tenant, đăng nhập thật, audit log đầy đủ.

**Backend focus sau MVP** (theo thứ tự ưu tiên):

1. **Nhiều tenant:** cô lập dữ liệu bằng Postgres Row-Level Security, test chứng minh tenant A không đọc được dữ liệu tenant B qua API, query trực tiếp hay presigned URL.
2. **Đăng nhập thật:** OIDC + RBAC (`admin`, `reviewer`, `staff`), kiểm quyền ở cả guard lẫn query.
3. **Audit log đầy đủ:** append-only, hash chain để phát hiện sửa đổi, có endpoint kiểm tra toàn vẹn.
4. **Nhắc gia hạn:** job định kỳ nhắc trước 60/30/7 ngày, chạy lại không gửi trùng.
5. **Tích hợp ngoài:** webhook gửi đi có ký HMAC + retry + delivery log; circuit breaker cho dịch vụ xác minh license.
6. **Agent:** chạy *bên trong* pipeline pg-boss (queue lo độ tin cậy, agent lo suy luận), có human-in-the-loop.
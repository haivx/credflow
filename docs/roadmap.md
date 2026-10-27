# Roadmap

> Nguồn sự thật về kế hoạch. Tiến độ hằng ngày ghi ở `docs/STATUS.md`, plan từng task ở `docs/plans/`.
> Mỗi phase: mục tiêu · phạm vi · tiêu chí hoàn thành · phụ thuộc. Phase chỉ xong khi đạt **đủ** tiêu chí.
> Ước lượng tổng: 5–6 tuần.

## P0 · Nền tảng và contract (2–3 ngày)

- **Mục tiêu:** chốt contract và stack, monorepo chạy được.
- **Phạm vi:**
  - Liam review và chốt `packages/contracts` (đang là bản nháp), `docs/doc-types.md`, các quyết định còn mở ở `docs/product.md` mục 8.
  - ADR 0001 chuyển từ "Đề xuất" sang "Chấp nhận" (hoặc sửa).
  - Thêm Drizzle + schema DB đầu tiên (`documents`, `staff`, `review_actions`), migration, pg-boss.
  - API: route `GET /health`, `GET /staff` (dữ liệu seed giả lập).
- **Tiêu chí hoàn thành:** `make setup && make dev` chạy trên máy sạch; `make test`, `make typecheck`, `make lint` pass; ADR 0001 ở trạng thái Chấp nhận.
- **Phụ thuộc:** không.

## P1 · Lát cắt dọc cho thẻ CPR (5–7 ngày)

- **Mục tiêu:** một loại giấy đi trọn từ upload đến kết quả. Biết sớm độ khó thật nằm ở đâu.
- **Phạm vi:** upload một file (API + màn upload tối giản) → job → phân loại → trích xuất CPR kèm evidence → rule cho CPR (`MISSING_FIELD`, `MISSING_EVIDENCE`, `LOW_CONFIDENCE`, `DATE_INCONSISTENT`, `EXPIRED`, `EXPIRING_SOON`, `NAME_MISMATCH`, `ISSUER_NOT_ACCEPTED`) → routing → hiển thị kết quả dạng thô. Chốt model LLM (ADR). Prompt có version.
- **Tiêu chí hoàn thành:** 5 thẻ CPR giả lập làm tay (≥ 3 bố cục khác nhau) chạy đúng end-to-end; output LLM luôn parse qua Zod; rule engine có unit test cho từng mã rule; mỗi document lưu `versions` và `timingMs`.
- **Phụ thuộc:** P0.

## P2 · Dữ liệu giả lập và eval baseline (5–6 ngày)

- **Mục tiêu:** có số liệu đầu tiên; từ đây mọi thay đổi đi qua `make eval`.
- **Phạm vi:** `tools/synth`: template HTML cho CPR (3–5 bố cục, tham khảo `docs/research/layout-notes.md`), render PNG/PDF, nhiễu (xoay, mờ, chụp lệch, nén JPEG), sinh `GoldenCase` có seed. `eval/`: chạy pipeline trên golden set, tính `EvalMetrics` + cắt theo tag, ghi `eval/runs/` và `eval/report.md`, so với lần trước. Chia dev/holdout. 10 ca khó làm tay trong `eval/hard-cases/`.
- **Tiêu chí hoàn thành:** `make synth SEED=1` sinh lại đúng cùng bộ dữ liệu; `make eval` sinh `report.md` tự động; có baseline CPR ghi trong `docs/STATUS.md`.
- **Phụ thuộc:** P1.

## P3 · Rule engine đầy đủ và routing (3–4 ngày)

- **Mục tiêu:** rule cấu hình được theo khách hàng, routing an toàn.
- **Phạm vi:** đủ 10 mã rule; chuẩn hoá và so khớp tên; tính hạn khi không in sẵn; nhiều file config theo khách hàng; yêu cầu bộ giấy theo vai trò (staff đã đủ bộ chưa).
- **Tiêu chí hoàn thành:** test cho mọi mã rule kể cả ca biên (ngày cuối tháng, năm nhuận, "LAST, FIRST"); `falseApproveRate = 0` trên golden set dev của CPR; config sai schema bị từ chối khi khởi động.
- **Phụ thuộc:** P2 (cần eval để đo).

## P4 · Hàng chờ và màn duyệt (5–6 ngày)

- **Mục tiêu:** người duyệt xử lý một ca trong dưới 30 giây.
- **Phạm vi:** hàng chờ (lọc theo lý do, sắp theo hạn); màn duyệt (ảnh + trường + evidence + rule không qua); sửa trường inline; duyệt / từ chối / yêu cầu nộp lại; lưu `ReviewAction` có `corrections`; trạng thái phía nhân viên. Highlight vùng chữ khi có `box`.
- **Tiêu chí hoàn thành:** xử lý trọn 10 ca trong hàng chờ chỉ bằng UI; mọi chỗ sửa xuất hiện trong `review_actions`; báo cáo "trường hay bị sửa nhất" chạy được từ dữ liệu đó.
- **Phụ thuộc:** P3.

## P5 · Đủ 5 loại giấy và ca khó (6–8 ngày)

- **Mục tiêu:** phủ đủ phạm vi MVP với số liệu đáng tin.
- **Phạm vi:** template + prompt + rule cho `professional_license`, `tb_test`, `background_check`, `vaccination_record`; ca khó theo `docs/doc-types.md`; dashboard hết hạn (admin). Thử nghiệm so sánh vision thuần với OCR + LLM, quyết bằng ADR.
- **Tiêu chí hoàn thành:** đạt chỉ số MVP ở `docs/product.md` mục 1 trên **holdout**; report có bảng theo loại giấy và theo tag.
- **Phụ thuộc:** P4.

## P6 · Deploy, writeup, demo (3–4 ngày)

- **Mục tiêu:** người lạ mở link là hiểu và dùng thử được.
- **Phạm vi:** deploy demo (dữ liệu giả lập, có giới hạn chi phí); README tiếng Anh; `docs/case-study.md` hoàn chỉnh (vấn đề → kiến trúc → trade-off → số liệu eval → giới hạn); video demo 3 phút.
- **Tiêu chí hoàn thành:** máy mới clone, điền `.env`, `make setup && make dev` là chạy; link demo hoạt động; case study có bảng số liệu holdout.
- **Phụ thuộc:** P5.

## Để sau MVP

Agent (xem `docs/product.md` mục 9), nhắc gia hạn, nhiều tenant, đăng nhập thật, audit log đầy đủ.

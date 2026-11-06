# STATUS

> Claude Code đọc file này đầu mỗi phiên và cập nhật cuối phiên (`/wrap`). Giữ ngắn, dưới 40 dòng.

**Cập nhật:** 2026-11-06
**Phase hiện tại:** P3 · Rule engine đầy đủ và routing (`docs/roadmap.md`). P0 xong 2026-11-03, P1 và P2 xong 2026-11-06.

## Đang làm

- Plan 02–11 xong, đã merge (PR #1–#8, #10, #11). P0 xong.
- Plan 10 đăng nhập cơ bản: merge PR #10 (CI xanh) 2026-11-03.
- Plan 11 upload stream + sha256 + dedupe (ADR 0005): merge PR #11 (CI xanh) 2026-11-04.
- Plan 12 BullMQ (ADR 0006): merge PR #24 2026-11-05.
- Plan 12h bỏ chế độ lai, thu hẹp `ask`: merge PR #25 2026-11-05.

> Claude cập nhật mục này sau **mỗi bước**, không chờ cuối phiên. Mở phiên mới gõ `/tiep` để làm tiếp.

- **`pr-reviewer` tạm tắt từ 2026-11-05:** Liam ưu tiên ship. Không chạy cho tới khi Liam bật lại. Giữ file agent, hook, test.
- **Plan 12i:** PR #27 đã merge; kiểm sau merge: kịch bản 1–6 đạt, tái hiện 3 lỗi hook (chỉ có tác dụng khi gọi reviewer). Tóm tắt ở comment PR #27.
- **Plan 12j:** PR #26 đã merge, worktree đã xoá.
- **Plan 12k (vá hook): dừng hẳn.** Commit `4f83553` chỉ ở máy, nhánh `fix/12k-pr-reviewer-hook`, chưa push. Bật lại reviewer thì đưa bản vá này vào trước.
- **Plan 12h kịch bản 4:** đạt: prompt hiện, Liam bấm No, tool từ chối, file không đổi. Nghi một lần Yes cho phép cả phiên: chưa kiểm.
- **Plan 13 sweep + idempotent (ADR 0007):** merge PR #29 2026-11-05.
- **Plan 14 LLM CPR (ADR 0008):** merge PR #30 2026-11-05. Sửa file tạm sót: merge PR #31.
- **Plan 15 rule engine CPR (ADR 0009):** merge PR #32 2026-11-05. Rule chưa nối vào pipeline.
- **Plan 16 nối rule + routing (ADR 0010):** merge PR #33 2026-11-06.
- **Plan 17 màn upload + kết quả thô:** merge PR #34 2026-11-06. **P1 xong:** đủ 9 tiêu chí hoàn thành (đối chiếu 2026-11-06).
- **Plan 18 eval harness:** merge PR #35; sửa đáp án ca 02 merge PR #36 (2026-11-06).
- **Plan 19 synth:** merge PR #37 2026-11-06. Phát hiện 4 ca duyệt nhầm cùng kiểu confidence 0.85 = ngưỡng (mục Eval) → plan 21.
- **Plan 20 harness:** merge PR #38 2026-11-06 (CI có `eval-ci`).
- **Plan 21 ngày mơ hồ:** merge PR #39 2026-11-06 (gate 0). `api.sh` `API_BODY_LIMIT`: PR #40 chờ merge.
- **Plan 22 ca khó đóng P2:** nhánh `feat/22-ca-kho`, 10 ca hard-cases, `eval-ci` 0/40, PR chờ Liam merge. **P2 xong** (đủ tiêu chí roadmap). Ca 08 cho thấy rule plan 21 chặn thừa ngày dạng "14th day of March, 2028"; ca 07 Haiku để trống ngày mơ hồ nên đường "quote bị chuẩn hoá" vẫn chưa kiểm được.

## Tiếp theo

1. Sau khi plan 22 merge: `/next` đề xuất bước đầu P3 (ứng viên: sửa chặn thừa ngày dạng thứ tự; `dateOrder` theo khách hàng; nhiều file config khách hàng).

## Vướng / câu hỏi mở

- **`CprCardFields`:** Liam 2026-11-05: không cần đổi. Output thật dùng được (21/22 trường chính đúng trên 5 fixture); `extraction.ts` giữ nguyên.
- **Ngày dạng `09/02/2025`:** Liam 2026-11-05: giữ nguyên, xử lý sau. Prompt để trống vì dễ nhầm; xem lại khi có số liệu eval ở P2.
- **Hạn mức $5:** code không chặn cứng, cần đặt spend limit trong Console. Đã dùng khoảng $0.004.

## Eval mới nhất

- **2026-11-06, plan 22 (pipeline 21, rules 1):** dev **40 ca** (10 hard + 30 synth): `falseApproveRate` **0% (0/40)**, `autoApproveRate` 55% (hard-cases 30%, synth 63.3%), classification 100%. Ca mới: 07 needs_review (Haiku để trống ngày mơ hồ), 08 **chặn thừa** (`DATE_INCONSISTENT` với "14th day of March, 2028", đáp án auto_approve), 09 tự duyệt (tên có dấu), 10 `EXPIRED`. `eval-ci` cổng 0 xanh.
- **2026-11-06, plan 21 (pipeline 21, rules 1; output ghi sẵn plan 19, 0 lời gọi LLM):** dev 36 ca `falseApproveRate` **0% (0/36)**, `autoApproveRate` 58.3% (21 ca, đều đúng; trước là 23 ca gồm 2 duyệt nhầm); holdout 10 ca **0/10**, tự duyệt 50%. Chỉ 0006, 0021 đổi decision. `eval/gate.json` = 0 (CI chặn từ nay). Chạy thật ca 03 (Haiku): `LOW_CONFIDENCE` qua lần này, chỉ `DATE_INCONSISTENT` chặn.
- **2026-11-06, plan 19 (synth SEED=1 + hard-cases; pipeline 16 / classify@1+extract-cpr@1 / haiku-5-5 / rules 1):**
  - **dev 36 ca** (6 hard + 30 synth): `falseApproveRate` **5.6% (2/36)**, `autoApproveRate` 63.9%, classification 100%, completionDate 94.3%, expirationDate 97.1%, các trường khác 100%; ~$0.00071/giấy; p50 3.1 s, p95 4.6 s. Theo nguồn: hard-cases 0/6, synth 2/30.
  - **holdout 10 ca synth:** `falseApproveRate` 20% (2/10).
  - **Cả 4 ca duyệt nhầm cùng một kiểu:** ngày LLM tự suy ra (ngày D/M ≤ 12 như `10/9/2025`; "Valid through MM/YYYY" → cuối tháng) được gán confidence **đúng 0.85 = ngưỡng**, nên qua `LOW_CONFIDENCE`. Ca 03 hard-cases là cùng kiểu. Chưa sửa (ngoài phạm vi plan 19): cần plan T3 riêng (ngưỡng hoặc prompt), chỉnh trên dev, không nhìn holdout.
- 2026-11-06, plan 18 baseline 6 ca hard-cases: `falseApproveRate` 0/6, `autoApproveRate` 33.3%.

## Nhật ký

- 2026-10-27: tạo skeleton (docs, contract nháp, rule engine stub, khung web/api/eval/synth).
- 2026-10-29: chốt NestJS + BullMQ (ADR 0001 viết lại); roadmap theo lộ trình học mức middle; thêm `docs/learning/` và chế độ dạy (plan 01).
- 2026-11-01: plan 02 merge (PR #1); plan 03 build packages ra `dist/` + typed lint (ADR 0003).
- 2026-11-02: plan 04 config env bằng `@nestjs/config` + Zod, merge (PR #3).
- 2026-11-02: plan 05 Drizzle + token `DB` + bảng `staff` + `GET /staff`, merge (PR #4).
- 2026-11-03: plan 06 `/ready` (Postgres + Redis, timeout), DB test `db-test`, `make test-int`, integration test đầu tiên.
- 2026-11-03: plan 08 `ApiError` + Zod pipe + exception filter (pg 23505/23503 → 409), `/staff?role=`, `/staff/:id`; `/ready` 503 không throw nữa.
- 2026-11-03: plan 09 `make setup` đủ migrate + seed, CI (lint, typecheck, test, test-int), kiểm máy sạch đạt → P0 xong.
- 2026-11-03: plan 10 đăng nhập cơ bản (ADR 0004): `users`/`sessions`, scrypt, cookie session, `AuthGuard`/`RolesGuard` toàn cục, FK `review_actions.reviewer_id`.
- 2026-11-03: plan 11 upload (ADR 0005): busboy, sha256 lúc stream, magic bytes, dedupe + 409, `LocalStorage`; chờ Liam viết `hashToTempFile`.
- 2026-11-05: plan 12h: bỏ chế độ lai, Claude code toàn bộ plan; `ask` chỉ còn `settings.json`, `hooks`.
- 2026-11-05: plan 12 BullMQ: queue, worker process riêng, retry, state machine, pipeline stub (ADR 0006).
- 2026-11-05: plan 14 Claude thật (`claude-haiku-5-5`, ADR 0008): phân loại, trích xuất CPR, phân loại lỗi, A10, A12.
- 2026-11-05: plan 13 sweep (`uploaded` đẩy lại, `processing` quá hạn sang người duyệt), xử lý conflict khi chạy trùng job (ADR 0007).
- 2026-11-06: plan 17 màn S1 tối giản: `GET /documents`, `GET /documents/:id` (`DocumentView`), web login + upload + kết quả thô, polling 2s.
- 2026-11-06: plan 16 nối rule vào worker: `extracted`, `RuleStep`, `asOf` UTC lưu ở `as_of` + CHECK C6 (ADR 0010), seed 3 chủ thẻ fixture, fixture 06.
- 2026-11-03: plan 07 chốt contract Document/ReviewAction (+ `checksum`, `extracted`; không tự từ chối), bảng `documents`/`review_actions`, 7 test ràng buộc DB.

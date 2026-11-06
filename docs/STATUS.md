# STATUS

> Claude Code đọc file này đầu mỗi phiên và cập nhật cuối phiên (`/wrap`). Giữ ngắn, dưới 40 dòng.

**Cập nhật:** 2026-11-06
**Phase hiện tại:** P2 · Dữ liệu giả lập và eval baseline (`docs/roadmap.md`). P0 xong 2026-11-03, P1 xong 2026-11-06.

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
- **Plan 18 eval harness:** Liam duyệt 2026-11-06. Nhánh `feat/18-eval-harness`. Code xong, `make eval` chạy thật (kịch bản 8–11 qua), baseline ghi ở mục Eval. **Tiếp:** full check, evidence, PR. **Hỏi Liam:** đáp án `courseType`/`validityText` viết tắt hay chép nguyên văn.

## Tiếp theo

1. **Plan 18:** chờ duyệt rồi code.

## Vướng / câu hỏi mở

- **`CprCardFields`:** Liam 2026-11-05: không cần đổi. Output thật dùng được (21/22 trường chính đúng trên 5 fixture); `extraction.ts` giữ nguyên.
- **Ngày dạng `09/02/2025`:** Liam 2026-11-05: giữ nguyên, xử lý sau. Prompt để trống vì dễ nhầm; xem lại khi có số liệu eval ở P2.
- **Hạn mức $5:** code không chặn cứng, cần đặt spend limit trong Console. Đã dùng khoảng $0.004.

## Eval mới nhất

- **Baseline 2026-11-06** (plan 18, run `2026-11-06T04-00-12-008Z`, dev, 6 ca hard-cases, versions pipeline 16 / prompt classify@1+extract-cpr@1 / haiku-5-5 / rules 1): `falseApproveRate` 0% (0/6), `autoApproveRate` 33.3% (01, 06), `classificationAccuracy` 100%, field: holderName/issuerName/expirationDate/cardNumber 100%, completionDate 80%, validityText 66.7%, courseType 50% (đáp án viết tắt so với chữ in đầy đủ); 11 lượt gọi, ~$0.0039; latency p50 3.3s, p95 4.9s. Ca 03 lần này `LOW_CONFIDENCE` (plan 16 từng ra auto_approved).

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

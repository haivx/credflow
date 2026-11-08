# STATUS

> Claude Code đọc file này đầu mỗi phiên và cập nhật cuối phiên (`/wrap`). Giữ ngắn, dưới 40 dòng.

**Cập nhật:** 2026-11-08
**Phase hiện tại:** P4.5 · Dựng UI, đang làm **P6a · Deploy lên Railway** (Liam 2026-11-07: thứ tự P4.5 → P6a → P5 → P6b; ADR 0013 Railway + Bucket). P0 xong 2026-11-03; P1, P2, P3 xong 2026-11-06; P4 xong 2026-11-07.

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
- **Plan 21 ngày mơ hồ:** merge PR #39 2026-11-06 (gate 0). `api.sh` `API_BODY_LIMIT`: merge PR #40.
- **Plan 22 ca khó đóng P2:** merge PR #41 2026-11-06. **P2 xong.**
- **Plan 23 check vùng theo plan (P3):** merge PR #42 2026-11-06.
- **Plan 24 ngày dạng thứ tự:** merge PR #43 2026-11-06.
- **Plan 25 config theo khách hàng (ADR 0011):** merge PR #44 2026-11-06.
- **Plan 26 staff đủ bộ giấy:** merge PR #45 2026-11-06. **P3 xong.**
- **P4:** chia 27 (API duyệt) / 28 (UI S2, S3) / 29 (báo cáo trường hay sửa, 10 ca bằng UI). Liam chọn cả 6 câu theo khuyến nghị (2026-11-06).
- **Plan 27 API duyệt:** merge PR #46 2026-11-06.
- **Plan 28 UI duyệt:** merge PR #47 2026-11-06 (evidence `.verify/reports/2026-11-06-28-ui-duyet.md`, ⚠️ PDF trong khung chưa kiểm ở headless).
- **Plan 29 báo cáo + 10 ca (đóng P4):** Liam duyệt 2026-11-07, nhánh `feat/29-bao-cao-10-ca`. Xong: evidence `.verify/reports/2026-11-07-29-bao-cao-10-ca.md` (✅, L3 10 ca, báo cáo khớp psql, test-int 196, eval-ci 0/44). Ca 05 tự duyệt đúng theo `bayleaf@1` (eval dùng default), thay bằng synth 0016. **P4 xong.** PR #48 CI xanh (architecture-zones + check), chờ Liam merge.

## Tiếp theo

1. **P4.5:** plan 30 (nền UI + S1) merge PR #50; roadmap PR #49. Còn plan 31 (S2/S3, bỏ `data-legacy`), 32 (bàn phím) chưa làm, xếp sau P6a.
2. **P6a (ADR 0013, Railway):** Liam tự làm theo bài dạy (memory: chế độ dạy). **App đã chạy công khai** `https://web-production-5b171.up.railway.app` (2026-11-08): web, api, worker, Postgres 18.6, Redis `noeviction`, bucket; migrate bằng pre-deploy; seed bằng `railway ssh` + `SEED_PASSWORD`; mật khẩu Postgres đã đổi (lộ trong screenshot). Kiểm thật: tự duyệt (staff-marisol), NAME_MISMATCH vào hàng chờ, reviewer xem file từ bucket. Plan 33 (`S3Storage`, `SEED_PASSWORD`) merge PR #53, evidence có phần Railway thật. Plan 34 (bảo vệ demo: rate limit 5 lần/15 phút theo email + 10 upload/giờ theo user, trần 50 giấy/ngày, `TOO_MANY_REQUESTS`, xoá file sau 3 ngày + cột `file_deleted_at`, `make db-reset-demo-password`, chặn khoảng trắng thừa): merge PR #55; evidence `.verify/reports/2026-11-08-34-bao-ve-demo.md`. Liam còn: Hobby + Usage Limits, trần Anthropic, backup + thử khôi phục, kiểm plan 34 trên Railway. **Plan 35 (Settings LLM, ADR 0014):** merge PR #56 2026-11-08; Liam đã đặt shared variable `SETTINGS_ENCRYPTION_KEY` cho `api` + `worker`; evidence `.verify/reports/2026-11-08-35-settings-llm.md`. Admin `/settings`: khoá Anthropic riêng (kiểm `models.retrieve`, mã hoá AES-256-GCM, bảng `app_settings`), model trong enum `LlmModel` (chỉ Haiku 5.5, chưa eval model mới). **Plan 36 (đăng ký Google, ADR 0015):** PR #58 CI xanh, chờ Liam merge; evidence `.verify/reports/2026-11-08-36-dang-ky-google.md`. Migration 0009 đã áp lên DB dev. Sau merge: Liam tạo OAuth client trên Google Cloud Console (Claude hướng dẫn), đặt 4 biến `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URL`, `OAUTH_STATE_SECRET` cho `api`, thử Gmail thật. **Bước tiếp (phiên sau):** dạy Liam backup Postgres trên Railway + thử khôi phục thật một lần. Sau đó: Hobby + Usage Limits, trần Anthropic, kiểm plan 34 trên Railway.
3. Việc nhỏ ghi lại từ plan 29: màn staff hiện `LOW_CONFIDENCE` ở cột Lý do cho giấy **đã duyệt**; ca 05 trong eval dùng default còn seed Odalys thuộc Bayleaf (cân nhắc ghi rõ trong `cases.json`).
3. Phạm vi P3 chính: config theo khách hàng, `dateOrder`, staff đủ bộ giấy.

## Kiểm tay để phase cuối (Liam 2026-11-06)

Liam tự chạy một lượt ở phase cuối; Claude đã tự chạy và có evidence cho từng mục.

- Plan 21: `make eval-ci` (cổng 0); upload ca 03 qua API → `DATE_INCONSISTENT`.
- Plan 24: `make eval-ci`.
- Plan 25: `make eval-ci`; upload thẻ 11 bằng Maren (Sunrise) → `auto_approved`, `versions.rules` = `sunrise@1`.
- Plan 27: `make test-int`; 2 decision song song cùng `version` → 200 + 409; preview sửa ngày → rule chấm lại.
- Plan 29: `make report-corrections` sau khi tự duyệt vài ca trên UI; đo 30 giây/ca bằng tay.
- Plan 26: `GET /staff/<id>/compliance` bằng reviewer sau khi upload một thẻ được tự duyệt; xem `EXPLAIN` trong evidence.

## Vướng / câu hỏi mở

- **`CprCardFields`:** Liam 2026-11-05: không cần đổi. Output thật dùng được (21/22 trường chính đúng trên 5 fixture); `extraction.ts` giữ nguyên.
- **Ngày dạng `09/02/2025`:** Liam 2026-11-05: giữ nguyên, xử lý sau. Prompt để trống vì dễ nhầm; xem lại khi có số liệu eval ở P2.
- **Hạn mức $5:** code không chặn cứng, cần đặt spend limit trong Console. Đã dùng khoảng $0.004.

## Eval mới nhất

- **2026-11-06, plan 25 (pipeline 24, rules `bayleaf@1+default@1+sunrise@1`):** dev **44 ca** `falseApproveRate` **0/44**, `autoApproveRate` 56.8% (25 ca). 40 ca cũ không đổi decision; 11-mdy-date (Sunrise) auto, 11-…-default needs_review, 12-issuer-bayleaf auto, 12-…-two-clients needs_review. `eval-ci` cổng 0 xanh.
- **2026-11-06, plan 24 (pipeline 24, rules 1):** dev 40 ca `falseApproveRate` **0/40**, `autoApproveRate` **57.5%** (23 ca; ca 08 hết chặn thừa); holdout 0/10, 50% (không đổi). `eval-ci` cổng 0 xanh.
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

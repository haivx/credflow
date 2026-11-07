# 29 · Báo cáo trường hay sửa, 10 ca bằng UI (đóng P4)

Phase: P4 · Trạng thái: Đã duyệt · Ngày: 2026-11-07

> Liam chọn cả 4 câu theo khuyến nghị (2026-11-07): báo cáo bằng script CLI, bấm giờ bằng Playwright (không lưu DB), 10 ca qua pipeline thật, mục tiêu 30 giây/ca của người thật để lượt kiểm tay phase cuối.

## Mục tiêu
Có lệnh `make report-corrections` đọc `review_actions.corrections` và in bảng "trường hay bị sửa nhất". Chạy trọn 10 ca thật trong hàng chờ chỉ bằng UI, có số giây mỗi ca, rồi đối chiếu báo cáo với các chỗ đã sửa. Đủ 4 tiêu chí xong của P4.

## Phạm vi
- Trong:
  - Query tổng hợp (SQL `jsonb_array_elements` trên `review_actions.corrections`) + hàm format bảng Markdown thuần + script CLI.
  - Bước `mark:<nhãn>` cho `ui.mts` để bấm giờ giữa các bước (JSON có `marks: {nhãn: ms từ lúc bắt đầu}`).
  - Lượt chạy 10 ca (driver để trong `.verify/`, không commit) + evidence.
- Ngoài: endpoint/API báo cáo, trang web báo cáo (S4/P5), lưu thời gian duyệt vào DB, highlight `box` (P5), Liam đo 30 giây/ca bằng tay (phase cuối).

## Thay đổi
| File / module | Thay đổi |
| --- | --- |
| `apps/api/src/review/corrections-report.ts` (mới) | `loadCorrectionsReport(db)`: 2 query. (1) Tổng: số `review_actions` theo `action`, số giấy đã duyệt (distinct `document_id`). (2) Theo `fieldPath`: `count(*)` lần sửa, `count(DISTINCT document_id)` giấy, số lần `before IS NULL` (LLM để trống, người điền) và số lần đổi giá trị; sắp lần sửa giảm dần rồi `fieldPath`. Dòng trả từ `db.execute(sql…)` parse bằng Zod schema cục bộ (ranh giới I/O). `formatCorrectionsReport(report, generatedAt)` là hàm thuần ra Markdown, có % giấy bị sửa trên tổng giấy đã duyệt. Kiểu báo cáo là interface cục bộ, không vào contract. |
| `apps/api/src/review/corrections-report.spec.ts` (mới) | Unit cho `formatCorrectionsReport`: không có dữ liệu → "Chưa có chỗ sửa nào"; % làm tròn; thứ tự giữ nguyên. |
| `apps/api/test/corrections-report.int-spec.ts` (mới) | Seed staff + document + `review_actions` qua `ReviewActionsRepository.insert` (có ca corrections rỗng, ca 2 action cùng giấy cùng trường, ca `before: null`) → số liệu đúng; DB rỗng → tổng 0, không lỗi. |
| `apps/api/scripts/report-corrections.ts` (mới) | Như `scripts/seed.ts`: nạp `.env`, `envSchema.pick({DATABASE_URL})`, drizzle, gọi load + format, in ra stdout; `--out <file>` tuỳ chọn ghi file. |
| `apps/api/package.json` | script `report:corrections`. |
| `Makefile` | target `report-corrections` (+ `.PHONY`, chú thích plan 29). |
| `.claude/skills/verify/scripts/ui.mts` | bước `mark:<nhãn>`; JSON có `marks` khi có bước mark. Sửa bằng Edit. |
| `.claude/skills/verify/FEATURE_MAP.md` | mục "Duyệt ca": báo cáo trường hay sửa, bước `mark:`. |
| `CLAUDE.md` | mục Lệnh: dòng `make report-corrections`. |
| `docs/STATUS.md`, `docs/roadmap.md` | P4 xong nếu đủ tiêu chí; ghi plan 28 đã merge (PR #47). |

## Vùng kiến trúc bị chạm
- `Makefile`
- `apps/api/package.json`
- `.claude/skills/verify/**`
- `CLAUDE.md`

## Contract / config / prompt bị ảnh hưởng
Không. Không đổi `packages/contracts`, schema DB, rule, prompt, model.

## Quyết định đáng nhớ
- Chỗ khó nhất: đếm đúng khi một giấy có nhiều `review_actions` sửa cùng trường. Có hai số riêng: lần sửa (`count(*)`) và giấy bị sửa (`count(DISTINCT document_id)`). % tính trên giấy, không tính trên action.
- Đã loại endpoint `GET /reports/corrections` (phải thêm schema vào contract, chưa có người dùng UI) và cột thời gian trong `review_actions` (đổi schema chỉ để đo một lần). Script CLI là đủ để báo cáo "chạy được từ dữ liệu".
- Tách `before IS NULL` khỏi "đổi giá trị": phân biệt LLM bỏ trống với LLM đọc sai, hữu ích khi chỉnh prompt ở P5.
- Hỏng khi: `fieldPath` đổi dạng (hiện `fields.<tên>.value`) thì báo cáo vẫn đúng nhưng tách nhóm theo chuỗi mới; dữ liệu lớn thì query quét toàn bảng (không index jsonb). Ở mức demo, vài nghìn dòng vẫn ổn. Nhiều tháng dữ liệu thì cần lọc theo `created_at` (để sau).
- Thời gian đo bằng Playwright là thời gian máy bấm (luồng UI và tốc độ tải trang), không phải thời gian người đọc. Mục tiêu dưới 30 giây/ca của người để Liam kiểm tay ở phase cuối.

## Tiêu chí xong
- [ ] `make report-corrections` in bảng từ dữ liệu thật của lượt 10 ca; số khớp với các chỗ sửa trong driver.
- [ ] 10 ca `needs_review` thật (pipeline + Haiku) xử lý hết chỉ bằng UI: có approve có sửa, approve không sửa, reject, request_reupload; về `queue-done`.
- [ ] Mỗi chỗ sửa trên UI xuất hiện đúng trong `review_actions.corrections` (đối chiếu bằng psql).
- [ ] Có số giây mỗi ca (`marks`), ghi vào evidence.
- [ ] Test 2 request cùng `version` → 1 thành công + `409`: đã có từ plan 27, chạy lại `make test-int` xanh.
- [ ] Evidence report (skill `verify`) có trong PR, kết quả ✅ hoặc phần chưa kiểm đã được Liam chấp nhận.

## Rủi ro / câu hỏi
- Haiku có thể route khác đáp án, ví dụ một ca dự kiến `needs_review` lại auto. Khi đó thay bằng ca synth dev khác trong 16 ca `needs_review` cho đủ 10, và ghi vào evidence.
- Dedupe sha256: file đã upload ở DB dev cũ → 200 duplicate. Chạy trên DB sạch (`down.sh` xoá volume, rồi `up.sh`).
- Chi phí LLM khoảng $0.01 cho 10 giấy.

## Verification plan

**Mức rủi ro:** T2. Thêm công cụ đọc dữ liệu (báo cáo), không chạm đường ra quyết định, rule, prompt hay contract. Lượt 10 ca dùng lại UI duyệt (T3) của plan 28 nhưng không sửa nó.

**Hành vi kỳ vọng (theo cách người dùng nói):**
- Liam gõ `make report-corrections` → thấy bảng: trường nào bị người duyệt sửa nhiều nhất, bao nhiêu lần, trên bao nhiêu giấy, bao nhiêu lần là điền vào chỗ AI để trống.
- Chưa ai sửa gì → báo "Chưa có chỗ sửa nào", không lỗi.
- Reviewer xử lý liền 10 ca trên web, ca này xong tự sang ca kế, hết thì thấy "Không còn ca nào".

**Các mức kiểm:**
- [ ] L0 Static: `make lint`, `make typecheck`.
- [ ] L1 Unit (`make test`): `corrections-report.spec.ts`.
- [ ] L2 Integration (`make test-int`): `corrections-report.int-spec.ts`; cả bộ test-int xanh (gồm test 409 của plan 27).
- [ ] L2 thật: `make report-corrections` trên DB dev sau lượt 10 ca, so với `psql` đếm tay (`SELECT … jsonb_array_elements …`).
- [ ] L2 Eval: không đổi prompt/model/rule → `make eval-ci` (cổng 0).
- [ ] L3 E2E UI: `up.sh --web`; upload 10 giấy bằng `api.sh` (đúng user chủ thẻ); một lần `ui.mts --login reviewer@example.test --path /review --step …` đi theo thứ tự hàng chờ (lấy từ `GET /review/queue`), mỗi ca `url:/review/<id>` → `mark:cN-start` → thao tác → `decide-*` → `mark:cN-end`; screenshot đầu, giữa, cuối mở bằng Read để nhìn; `consoleErrors`/`failedRequests` = 0.
- [ ] L4: không.

**Kịch bản sẽ chạy:**
| # | Kịch bản | Input / fixture | Kết quả quan sát được kỳ vọng |
|---|---|---|---|
| 1 | báo cáo DB rỗng | DB sạch, `make report-corrections` | "Chưa có chỗ sửa nào", exit 0 |
| 2 | nạp 10 ca | hard-cases 02, 03, 04, 05, 07, 10 (đúng user chủ thẻ) + 4 synth dev `needs_review` (vd 0002, 0005, 0013, 0015) bằng `staff@example.test` | 10 ca ở `GET /review/queue` (thiếu thì thay ca synth khác, ghi lại) |
| 3 | 10 ca bằng UI | 4 approve có sửa (ngày / tên / số thẻ, có ít nhất 1 ô trống → điền), 2 approve không sửa, 2 reject có ghi chú, 2 request_reupload có ghi chú | tự sang ca kế mỗi lần, kết thúc `queue-done`; `steps` toàn `ok` |
| 4 | corrections trong DB | `psql` `review_actions` | 10 dòng, `corrections` đúng từng chỗ sửa ở kịch bản 3, ca không sửa → `[]` |
| 5 | báo cáo thật | `make report-corrections` | số lần sửa / giấy / điền chỗ trống khớp kịch bản 4; % trên 10 giấy |
| 6 | thời gian | `marks` của kịch bản 3 | số giây từng ca, p50 / max ghi vào evidence |
| 7 | staff thấy lý do | `ui.mts --login staff-…` ở `/` | ca reject / reupload hiện lý do (hồi quy plan 28) |

**Test mới phải đỏ trên code cũ:**
- `corrections-report.int-spec.ts` ca "2 action cùng giấy cùng trường": tạm bỏ `DISTINCT` → số giấy sai → đỏ.
- `corrections-report.spec.ts` ca rỗng: viết trước hàm format → đỏ.
- `ui.mts --step mark:x` trên bản cũ → "không biết bước mark", exit 1.

**Thay đổi feature map:** mục "Duyệt ca": thêm `make report-corrections` (đọc gì, in gì) và bước `mark:` của `ui.mts`.

**Những gì sẽ KHÔNG kiểm, và lý do:**
- Thời gian người thật dưới 30 giây/ca: Liam kiểm tay ở phase cuối (memory T3, 2026-11-06). Số đo Playwright chỉ chứng minh luồng chạy.
- PDF trong khung ở headless: như plan 28 (ca 02 là PDF; chỉ kiểm có `file-pdf`, không kiểm nội dung hiển thị).
- Hiệu năng query trên dữ liệu lớn: không có dữ liệu lớn ở P4.

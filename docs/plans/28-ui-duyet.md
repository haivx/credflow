# 28 · UI hàng chờ S2, màn duyệt S3, lý do cho staff

Phase: P4 · Trạng thái: Đã duyệt · Ngày: 2026-11-06

## Mục tiêu
Reviewer xử lý một ca hoàn toàn trên web: mở hàng chờ, lọc/sắp, mở ca, xem ảnh giấy cạnh các trường, sửa trường (rule chấm lại khi rời ô), rồi duyệt / từ chối / yêu cầu nộp lại; xong tự mở ca kế. Staff thấy lý do khi bị từ chối hoặc phải nộp lại. Dùng API plan 27; plan 29 chạy 10 ca bằng UI và làm báo cáo trường hay sửa.

Liam chốt 2026-11-06: staff thấy note (đổi contract, thêm `lastReview`); URL riêng + tự mở ca kế; preview tự động khi rời ô; thêm vitest cho web + mở rộng `ui.mts` có bước thao tác.

## Phạm vi
- Trong:
  - Contract `DocumentView.lastReview?` + API trả kèm ở `GET /documents`, `GET /documents/:id`, `GET /review/documents/:id`.
  - Route web `/review` (S2), `/review/[id]` (S3); `/` của reviewer chuyển sang `/review`.
  - S1 staff: hiện lý do khi `rejected` / `reupload_requested`.
  - vitest cho `apps/web` (hàm thuần); `ui.mts` thêm `--step`.
- Ngoài: highlight `box` (P5); phím tắt; báo cáo trường hay sửa và 10 ca (plan 29); nộp lại nối với giấy cũ; admin.

## Thiết kế

**Contract** (`packages/contracts/src/routing.ts`): `ReviewSummary = { action: ReviewActionKind, note?: string, decidedAt: IsoTimestamp }`; `DocumentView = DocumentRecord.omit({storageKey, checksum}).extend({ lastReview: ReviewSummary.optional() })`. Chỉ thêm trường tuỳ chọn; không có `reviewerId`, không có `corrections` (staff không cần, không lộ ai duyệt).

**API:** hàm `latestReviews(db, documentIds)` (`documents-read.service.ts`): `SELECT DISTINCT ON (document_id) ... ORDER BY document_id, created_at DESC, id DESC` (dùng index `review_actions_document_id_idx` có sẵn), gắn vào `toView`. Dùng ở `listForStaff`, `findForStaff`, `ReviewReadService.findDocument`. Một query thêm mỗi lần đọc, không N+1.

**Web:**
- `app/_lib/useCurrentUser.ts`: hook hỏi `/auth/me` (gom logic đang nằm trong `page.tsx`); `app/_components/AppShell.tsx`: header + đăng xuất, dùng chung 3 trang. `/` của reviewer → `router.replace("/review")`.
- `app/review/page.tsx` → `ReviewQueue.tsx`: chọn lý do (`RuleCode` từ contract) và cách sắp, đặt lên URL (`?reason=&sort=`); bảng: nhân viên, loại giấy, lý do, hạn, ngày nộp; "Tải thêm" theo `nextCursor`; trống → "Không còn ca nào".
- `app/review/[id]/page.tsx` → `ReviewScreen.tsx`:
  - Trái `FileViewer`: `<iframe>` cho PDF, `<img>` cho ảnh, nguồn `/api/review/documents/:id/file`.
  - Trên phải: rule không qua kèm message (từ preview nếu đã sửa, không thì `ruleResults` đã lưu), ghi `asOf`.
  - Phải `FieldEditor`: mỗi trường một ô (ngày: text `YYYY-MM-DD`; enum: `<select>` lấy option từ contract; text: input), cạnh đó confidence, `quote`; trường nằm trong `fieldRefs` của rule trượt được tô đỏ. Rời ô mà có thay đổi → `POST /preview` với toàn bộ chỗ sửa hiện tại; response cũ về sau response mới thì bỏ (đếm số lần gọi).
  - Dưới: ô ghi chú + 3 nút. Từ chối / nộp lại khi ghi chú trống → nút bị khoá + chữ nhắc (API vẫn chặn 400). Gửi `{action, version, corrections, note}`.
  - 200 → lấy `GET /review/queue?{cùng bộ lọc}&limit=1` → có ca thì `router.push("/review/<id>?<bộ lọc>")`, không thì về `/review` với thông báo hết ca. 409 → báo "Ca đã thay đổi, tải lại" + nút tải lại (giữ chỗ sửa trên màn để người duyệt tự xem lại). 400 → hiện `details`.
  - Ca không còn `needs_review`: chỉ xem, kèm lịch sử `reviewActions`.
- `app/_lib/review.ts` (hàm thuần, có test): `editableFields(extraction)` (tên, kiểu ô, option enum, lấy từ schema contract), `buildCorrections(extraction, edits)` (chỉ trường đổi; chuỗi rỗng → null; `before` là giá trị gốc), `queueParams(reason, sort)` / đọc lại từ URL, `failedFieldRefs(ruleResults)`.
- Staff: `DocumentDetail` và bảng của `StaffHome` hiện `lastReview.note` khi `rejected` / `reupload_requested`.
- Style inline như S1 (chưa có design system); `data-testid` cho mọi phần tử L3 dùng.

**Test hạ tầng:**
- `apps/web/package.json`: `vitest` devDep + script `test` (`make test` tự chạy vì `pnpm -r --if-present test`); `apps/web/vitest.config.ts` chỉ `app/**/*.test.ts`, môi trường node (chỉ hàm thuần, không test component).
- `.claude/skills/verify/scripts/ui.mts`: thêm `--step` lặp được, chạy theo thứ tự sau khi mở trang: `click:<testid>`, `fill:<testid>=<giá trị>`, `blur:<testid>`, `wait:<chữ>`, `shot:<file>`, `goto:<path>`. Lỗi một bước → exit 1, vẫn chụp. In thêm `steps` vào JSON. Không đổi hành vi khi không có `--step`.

## Thay đổi
| File / module | Thay đổi |
| --- | --- |
| `packages/contracts/src/routing.ts` + `contracts.test.ts` + fixture `DocumentView.json` | `ReviewSummary`, `DocumentView.lastReview?`; ca fixture có `lastReview` |
| `apps/api/src/documents/documents-read.service.ts` | `latestReviews`, gắn `lastReview` |
| `apps/api/src/review/review-read.service.ts` | `findDocument` có `lastReview` |
| `apps/api/test/documents-read.int-spec.ts`, `review-decision.int-spec.ts` | `lastReview` sau quyết định; không có → vắng |
| `apps/web/app/page.tsx`, `_lib/useCurrentUser.ts`, `_components/AppShell.tsx` | tách đăng nhập/header; reviewer → `/review` |
| `apps/web/app/review/page.tsx`, `review/[id]/page.tsx`, `_components/ReviewQueue.tsx`, `ReviewScreen.tsx`, `FieldEditor.tsx`, `FileViewer.tsx` | S2, S3 |
| `apps/web/app/_lib/review.ts` + `review.test.ts` | hàm thuần |
| `apps/web/app/_components/DocumentDetail.tsx`, `StaffHome.tsx` | lý do cho staff |
| `apps/web/package.json`, `apps/web/vitest.config.ts`, `pnpm-lock.yaml` | vitest |
| `.claude/skills/verify/scripts/ui.mts`, `SKILL.md`, `FEATURE_MAP.md` | `--step`; map S2/S3 |
| `docs/flows.md` | F3 ghi route; F1 lý do cho staff |

## Vùng kiến trúc bị chạm
- `packages/contracts/src/**`
- `apps/web/package.json`
- `apps/web/vitest.config.ts`
- `.claude/skills/verify/**`

## Contract / config / prompt bị ảnh hưởng
- **Contract:** thêm `ReviewSummary`, `DocumentView.lastReview` (tuỳ chọn; client cũ không vỡ). Liam đã đồng ý hướng này 2026-11-06.
- Không đổi schema DB, rule, prompt, model → không cần `make eval` (vẫn `make eval-ci`).

## Quyết định đáng nhớ
- **Chỗ khó nhất:** giữ đồng bộ màn S3 với dữ liệu thật: preview trả về lệch thứ tự (bỏ response cũ), 409 khi người khác duyệt trước (không ghi đè, giữ chỗ sửa để xem lại), và "ca kế" phải lấy lại từ API theo đúng bộ lọc chứ không từ danh sách đã tải (danh sách cũ có thể đã có người xử lý).
- **Loại:** tính chỗ sửa ở server bằng cách gửi cả extraction (API plan 27 nhận corrections, `before` server kiểm); test component bằng React Testing Library (thêm jsdom + nhiều dependency; L3 qua `ui.mts` đã phủ phần giao diện, vitest chỉ cho hàm thuần); Playwright test chạy trong CI (đã ghi "Học nâng cao" từ plan 17).
- **`lastReview` không có reviewerId:** staff chỉ cần lý do; ai duyệt là dữ liệu audit, chỉ reviewer xem qua `reviewActions`.
- **Khi nào hỏng:** ô ngày là text tự do (trình duyệt `type=date` đổi định dạng theo locale, dễ lệch); reviewer gõ sai định dạng thì API trả 400 và màn hiện lỗi chứ không tự sửa. Option enum lấy từ contract nên thêm loại giấy ở P5 tự có ô đúng, nhưng file viewer chưa phóng to/xoay.

## Tiêu chí xong
- [ ] Reviewer: `/review` lọc lý do, sắp hạn/ngày nộp, "Tải thêm" đúng; mở ca thấy ảnh giấy, trường, quote, rule trượt.
- [ ] Sửa một ngày rồi rời ô → danh sách rule đổi theo preview; DB không đổi.
- [ ] Duyệt có sửa → ca kế (cùng bộ lọc) tự mở; `review_actions` có corrections đúng.
- [ ] Từ chối / nộp lại khi ghi chú trống bị chặn; có ghi chú → staff thấy lý do trên S1.
- [ ] Hai người cùng duyệt một ca → người sau thấy thông báo 409, không ghi đè.
- [ ] `make lint typecheck test test-int eval-ci` xanh.
- [ ] Evidence report (skill `verify`) có trong PR, kết quả ✅ hoặc phần chưa kiểm đã được Liam chấp nhận.

## Rủi ro / câu hỏi
- PDF trong `<iframe>` tuỳ trình duyệt; Chromium của Playwright hiển thị được. Nếu screenshot không thấy nội dung PDF thì ghi rõ trong evidence và kiểm bằng ảnh PNG.
- Sửa `apps/web/app/page.tsx` đổi cấu trúc S1: kiểm lại L3 của plan 17 (staff upload → "Đã tự duyệt").

## Verification plan

**Mức rủi ro:** T3: màn ra quyết định duyệt (approve do người), đổi contract, luồng 409.

**Hành vi kỳ vọng (theo cách người dùng nói):**
- Reviewer đăng nhập thấy hàng chờ, lọc "chỉ ca EXPIRED", mở ca, thấy ảnh giấy bên trái và các trường kèm chữ gốc bên phải.
- Reviewer sửa ngày hoàn thành, bấm ra ngoài ô → rule chấm lại ngay; bấm Duyệt → ca kế mở luôn.
- Từ chối không ghi lý do thì không bấm được; ghi lý do rồi từ chối → nhân viên thấy "Bị từ chối: <lý do>".
- Hai người duyệt cùng ca → người sau được báo ca đã thay đổi.

**Các mức kiểm:**
- [ ] L0 Static: `make lint`, `make typecheck`.
- [ ] L1 Unit (`make test`): `apps/web` `review.test.ts` (`buildCorrections`: không đổi → rỗng, chuỗi rỗng → null, before = gốc; `editableFields`: CPR đủ trường, enum TB có option; `queueParams` khứ hồi; `failedFieldRefs`); contracts: `DocumentView` có/không `lastReview`.
- [ ] L2 Integration (`make test-int`): `GET /documents/:id` của staff có `lastReview {action, note, decidedAt}` sau `request_reupload`, không có `reviewerId`; giấy chưa duyệt → không có `lastReview`; `GET /review/documents/:id` có `lastReview`.
- [ ] L2 Eval: không đổi prompt/model/rule → `make eval-ci` (cổng 0).
- [ ] L3 E2E UI (`up.sh --web`, `ui.mts --step`, 3 thẻ SAMPLE upload thật như plan 27): kịch bản dưới, screenshot mỗi kịch bản, mở bằng Read và nhìn; `consoleErrors`/`failedRequests` = 0 (trừ 409 cố ý ở kịch bản 5).
- [ ] Hồi quy S1: staff upload `01-expires.png` → "Đã tự duyệt" (L3 plan 17).
- [ ] L4: không.

**Kịch bản sẽ chạy:**
| # | Kịch bản | Input / fixture | Kết quả quan sát được kỳ vọng |
|---|---|---|---|
| 1 | hàng chờ | reviewer `/` | chuyển sang `/review`, 3 ca, ca có hạn đứng đầu; lọc `EXPIRED` còn 1 ca (02) |
| 2 | sửa + preview | ca 02, `completionDate` = `2025-09-02`, blur | rule `MISSING_FIELD`, `EXPIRED` biến mất khỏi danh sách trượt; DB `version` không đổi |
| 3 | duyệt → ca kế | bấm Duyệt ở ca 02 | URL sang ca kế; DB 02 `approved`, `review_actions.corrections` có `completionDate` |
| 4 | ghi chú bắt buộc | ca TB, bấm Yêu cầu nộp lại khi trống | nút khoá; điền lý do → `reupload_requested`; staff `/` thấy "Cần nộp lại: <lý do>" |
| 5 | 409 | mở ca 03, duyệt bằng `api.sh` cùng `version`, rồi bấm Từ chối trên UI | thông báo ca đã thay đổi; DB chỉ 1 `review_actions` |
| 6 | hết ca | duyệt ca cuối | về `/review`, "Không còn ca nào" |
| 7 | quyền | staff mở `/review` | không thấy hàng chờ (thông báo không có quyền), API 403 |

**Test mới phải đỏ trên code cũ:**
- int `lastReview` của staff: chạy trên `main` hiện tại (chưa gắn `lastReview`) → đỏ.
- `review.test.ts` `buildCorrections` "chuỗi rỗng → null": tạm bỏ dòng chuẩn hoá → đỏ.
- `ui.mts --step` với testid không có → exit 1 (cho thấy bước lỗi không bị nuốt).

**Thay đổi feature map:** mục "Duyệt ca": thêm UI `/review`, `/review/[id]`, testid chính, cách chạy L3 bằng `--step`; mục "Đọc giấy của tôi": `lastReview`.

**Những gì sẽ KHÔNG kiểm, và lý do:**
- Mục tiêu "dưới 30 giây/ca" và 10 ca bằng UI: plan 29.
- Highlight `box`: P5.
- Nhiều trình duyệt (chỉ Chromium của Playwright).
- Liam kiểm tay T3: dồn phase cuối (Liam 2026-11-06); Claude chạy đủ kịch bản trên.

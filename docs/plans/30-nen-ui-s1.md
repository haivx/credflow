# 30 · Nền UI (Tailwind + shadcn/ui + TanStack Query) và làm lại S1

Phase: P4.5 · Trạng thái: Đã duyệt · Ngày: 2026-11-07

> Liam 2026-11-07: P4.5 chia 30 (nền + S1) / 31 (S2 + S3) / 32 (bàn phím + hoàn thiện); Tailwind **v3**; Claude tự thiết kế bằng shadcn, tông trung tính; giữ tiếng Việt.

## Mục tiêu
`apps/web` dùng đúng stack ADR 0001: Tailwind + shadcn/ui cho giao diện, TanStack Query cho dữ liệu. Có layout chung (header, vai trò, đăng xuất) và S1 (đăng nhập, nộp giấy, danh sách giấy của tôi) rõ ràng, đẹp, dùng được trên điện thoại. Staff không còn thấy mã rule như `LOW_CONFIDENCE` ở giấy đã duyệt.

## Phạm vi
- Trong:
  - Cài Tailwind 3 + PostCSS + shadcn/ui (style `new-york`, màu nền `neutral`, primary teal), `lucide-react`, `sonner`; TanStack Query 5 với `QueryClientProvider`.
  - Component shadcn: `button`, `input`, `label`, `card`, `badge`, `table`, `alert`, `skeleton`; `lib/utils.ts` (`cn`).
  - `AppShell` mới: header dính trên cùng, logo, email + nhãn vai trò, nút đăng xuất; trạng thái đang tải dùng skeleton; `/auth/me` qua TanStack Query.
  - Đăng nhập: card giữa trang, label rõ, lỗi dạng alert.
  - S1: vùng kéo thả file (vẫn có `<input type=file>` thật), chọn loại giấy (giữ `<select>` gốc, style bằng Tailwind), danh sách giấy dạng bảng trên desktop / thẻ trên điện thoại, badge trạng thái theo màu, lý do bằng tiếng Việt dễ hiểu, chi tiết giấy dạng card (thông tin kỹ thuật gom vào `<details>` "Chi tiết kỹ thuật").
  - Polling 2 giây thay bằng `refetchInterval` của TanStack Query (vẫn dừng sau 2 phút, vẫn chỉ khi còn giấy đang xử lý); upload là mutation, xong thì invalidate danh sách.
  - Sửa lý do phía staff: hàm thuần `staffReason(doc)`: bị từ chối / nộp lại → ghi chú người duyệt; `needs_review` → lý do vào hàng chờ đổi sang câu tiếng Việt; trạng thái khác → không hiện gì.
  - `<html lang="vi">`.
  - S2, S3 tạm bọc trong `data-legacy` + vài style nền để không vỡ khi Tailwind reset CSS (preflight); plan 31 làm lại thật.
  - `ui.mts`: thêm `--viewport <rộng>x<cao>` và bước `upload:<testid>=<file>` để kiểm S1 trên điện thoại và nộp file bằng UI.
- Ngoài: làm lại S2, S3 (plan 31); phím tắt, focus (plan 32); dark mode; i18n; S4, S5 (P5); thêm `next build` vào CI (đề xuất riêng, xem Rủi ro).

## Thay đổi
| File / module | Thay đổi |
| --- | --- |
| `apps/web/package.json`, `pnpm-lock.yaml` | Thêm (version cố định, đều phát hành trước 2026-10-24): `tailwindcss@3.4.19`, `postcss@8.5.31`, `autoprefixer@10.6.1`, `tailwindcss-animate@1.0.7`, `@tanstack/react-query@5.104.5`, `class-variance-authority@0.7.1`, `clsx@2.1.1`, `tailwind-merge@2.6.1` (nhánh 2.x hỗ trợ Tailwind 3; 3.x chỉ hỗ trợ v4), `lucide-react@1.61.0`, `sonner@2.0.8`, `@radix-ui/react-slot@1.5.0`, `@radix-ui/react-label@2.1.17` |
| `apps/web/tsconfig.json` | `paths: { "@/*": ["./*"] }` cho alias của shadcn |
| `apps/web/tailwind.config.ts`, `postcss.config.mjs`, `components.json` (mới) | Cấu hình Tailwind 3 theo shadcn (CSS variables, `content` trỏ `app/**`, `components/**`) |
| `apps/web/app/globals.css` (mới) | Token màu (`--background`, `--primary`…, nền neutral, primary teal), base layer; style tạm cho `[data-legacy]` |
| `apps/web/components/ui/*.tsx`, `apps/web/lib/utils.ts` (mới) | Sinh bằng `pnpm dlx shadcn@2.3.0 add …` (bản CLI cho Tailwind 3), đọc lại từng file, sửa cho qua `make lint` (không nới rule) |
| `apps/web/app/layout.tsx` | import `globals.css`, `lang="vi"`, bọc `Providers`, `<Toaster />` |
| `apps/web/app/providers.tsx` (mới) | `"use client"`, `QueryClientProvider` (tạo client một lần bằng `useState`) |
| `apps/web/app/_lib/queries.ts` (mới) | `useMe`, `useLogin`, `useLogout`, `useMyDocuments` (`refetchInterval` theo hàm thuần `pollInterval`), `useUpload`; queryFn dùng lại `apiFetch` (`app/_lib/api.ts`), lỗi thì ném `ApiRequestError` mang `ApiError` |
| `apps/web/app/_lib/status.ts` | Thêm `staffReason`, `statusTone` (màu badge theo trạng thái), `reasonLabel` (`Record<RuleCode, string>` tiếng Việt), `pollInterval(docs, startedAt, now)` |
| `apps/web/app/_lib/status.test.ts` (mới) | Unit cho 4 hàm trên |
| `apps/web/app/_components/AppShell.tsx`, `LoginForm.tsx`, `StaffHome.tsx`, `UploadForm.tsx`, `DocumentDetail.tsx` | Làm lại bằng component shadcn + Tailwind, bỏ hết `style={{…}}`; **giữ nguyên mọi `data-testid` hiện có** |
| `apps/web/app/review/page.tsx`, `review/[id]/page.tsx` | Bọc nội dung trong `<div data-legacy>` (tạm tới plan 31) |
| `.claude/skills/verify/scripts/ui.mts` | `--viewport WxH` (mặc định 1200x900), bước `upload:<testid>=<file>` (`setInputFiles`). Sửa bằng Edit |
| `.claude/skills/verify/FEATURE_MAP.md`, `SKILL.md` | Mục S1 mới, `--viewport`, `upload:` |
| `docs/decisions/0012-tailwind-3-shadcn.md` (mới) | Chọn Tailwind 3 (không v4) trên Next 14, shadcn CLI 2.3.0, `tailwind-merge` 2.x; khi nào nâng |
| `docs/STATUS.md` | Từng bước |

## Vùng kiến trúc bị chạm
- `apps/web/package.json`
- `apps/web/tsconfig.json`
- `.claude/skills/verify/**`

## Contract / config / prompt bị ảnh hưởng
Không. Không chạm `packages/contracts`, `apps/api`, `config/rules`, prompt, model. Chỉ đọc kiểu `RuleCode`, `DocumentStatus` từ contracts.

## Quyết định đáng nhớ
- Chỗ khó nhất: thêm Tailwind thì preflight (CSS reset) áp cho **cả** S2, S3 vốn style inline: nút mất viền, bảng mất kẻ. Chọn bọc tạm `data-legacy` + vài style nền thay vì làm cả 3 màn trong một PR (PR quá to, khó duyệt). Plan 31 xoá phần tạm này.
- Đã loại: Tailwind v4 (cần cấu hình kiểu mới, shadcn hiện tại nhắm v4 + React 19 / Next 15; nâng Next ngoài phạm vi); Radix `Select` thay `<select>` gốc (bước `select:` của `ui.mts` và trình duyệt điện thoại cần `<select>` thật); `next/font/google` (tải font lúc build, máy offline thì lỗi) → dùng font hệ thống.
- TanStack Query không thay `apiFetch`: queryFn gọi `apiFetch` rồi ném lỗi khi `ok: false`, để parse bằng Zod của contracts vẫn ở một chỗ.
- Hỏng khi: nâng Next 15 / Tailwind 4 thì phải chạy lại shadcn init và đổi `tailwind-merge` 3 (ghi trong ADR 0012). Shadcn sinh code vào repo nên nâng version không tự động, phải so tay.
- Mức middle: Server/Client Component, query key, invalidate là đủ; optimistic update, prefetch ở server (`HydrationBoundary`) ghi vào "Học nâng cao", không làm.

## Tiêu chí xong
- [ ] S1 và màn đăng nhập không còn `style={{` (grep), dùng component shadcn.
- [ ] Nộp giấy bằng UI (kéo thả hoặc chọn file) → badge "Đang xử lý" → tự đổi sang kết quả cuối, không cần tải lại trang.
- [ ] Giấy đã duyệt / tự duyệt không hiện lý do; giấy chờ duyệt hiện câu tiếng Việt; bị từ chối / nộp lại hiện ghi chú người duyệt.
- [ ] Screenshot desktop (1200 px) và điện thoại (390 px) của đăng nhập và S1: không cuộn ngang trang.
- [ ] Lượt 10 ca của plan 29 (`.verify/29/run.sh`) chạy lại vẫn qua trên S2/S3 bọc `data-legacy`.
- [ ] `make lint`, `make typecheck`, `make test`, `pnpm --filter @credflow/web build` xanh.
- [ ] ADR 0012; evidence report (skill `verify`) trong PR.

## Rủi ro / câu hỏi
- CI không chạy `next build`, nên lỗi cấu hình Tailwind/PostCSS chỉ lộ khi build. Plan này chạy build ở máy và ghi vào evidence. Thêm bước build web vào CI (`.github/**`) để plan riêng nếu Liam muốn.
- shadcn CLI cần mạng để lấy registry. Nếu bản 2.3.0 không chạy được thì chép tay code component từ registry v3, vẫn đọc từng file.
- Context7 chưa đăng nhập (OAuth) nên chưa dùng được; version lấy từ npm registry (`npm view`), cấu hình theo tài liệu shadcn cho Tailwind 3. Liam đăng nhập Context7 thì tôi đối chiếu lại tài liệu lúc code.

## Verification plan

**Mức rủi ro:** T2. Đổi giao diện và cách gọi dữ liệu ở web; không đổi API, rule, đường ra quyết định. S2/S3 chỉ bị bọc lại, chạy lại lượt 10 ca để chắc không hỏng.

**Hành vi kỳ vọng (theo cách người dùng nói):**
- Staff mở web trên máy tính hoặc điện thoại, đăng nhập, kéo file thẻ CPR vào ô, thấy "Đang xử lý" rồi tự đổi thành "Đã tự duyệt" (màu xanh) mà không phải tải lại trang.
- Giấy đã được người duyệt duyệt thì không còn hiện `LOW_CONFIDENCE`; giấy đang chờ duyệt hiện lý do bằng tiếng Việt; giấy bị từ chối hiện đúng ghi chú người duyệt.
- Nộp file không phải PDF/ảnh thì thấy câu báo lỗi rõ.
- Reviewer vẫn duyệt được như trước.

**Các mức kiểm:**
- [ ] L0 Static: `make lint`, `make typecheck`, `pnpm --filter @credflow/web build`; `grep -rn "style={{" apps/web/app/_components/{AppShell,LoginForm,StaffHome,UploadForm,DocumentDetail}.tsx` rỗng.
- [ ] L1 Unit (`make test`): `status.test.ts`: `staffReason` (approved có routing `LOW_CONFIDENCE` → null; needs_review → câu tiếng Việt; rejected → note), `statusTone` đủ 9 trạng thái, `reasonLabel` đủ mọi `RuleCode` (kiểu `Record` ép lúc compile), `pollInterval` (còn giấy đang xử lý → 2000; quá 2 phút hoặc không còn → false).
- [ ] L2: không đổi API. Gọi API thật qua UI ở L3; `make test-int` chạy lại cho chắc (không đổi kỳ vọng).
- [ ] L2 Eval: không đổi prompt/model/rule → `make eval-ci` (cổng 0).
- [ ] L3 E2E UI (`up.sh --web`, `ui.mts`): kịch bản dưới; mỗi screenshot mở bằng Read và nhìn; `consoleErrors` 0; `failedRequests` không có HTTP ≥ 400 ngoài 415 cố ý ở kịch bản 4.
- [ ] L4: không.

**Kịch bản sẽ chạy:**
| # | Kịch bản | Input / fixture | Kết quả quan sát được kỳ vọng |
|---|---|---|---|
| 1 | đăng nhập | `/` chưa đăng nhập, desktop + `--viewport 390x844` | card đăng nhập; điền sai mật khẩu → `login-error`; đúng → vào S1 |
| 2 | nộp bằng UI, tự duyệt | `staff-marisol`, `upload:upload-file=eval/hard-cases/cpr/01-expires.png`, `click:upload-submit` | `upload-message` "đang xử lý", badge "Đang xử lý" rồi `wait:Đã tự duyệt` trong cùng trang |
| 3 | chờ duyệt có lý do tiếng Việt | `staff-tobias` nộp `02-valid-2-years.pdf` | badge "Đang chờ duyệt", lý do tiếng Việt (vd thiếu ngày hết hạn / đã hết hạn), không có chuỗi `MISSING_FIELD` |
| 4 | file sai loại | file `.txt` trong `.verify/` | câu "Chỉ nhận file PDF, PNG hoặc JPEG.", 415 |
| 5 | đã duyệt không còn mã rule | reviewer duyệt ca 02 bằng `api.sh`; staff-tobias mở `/` | "Đã duyệt", ô lý do trống, không có `MISSING_FIELD`/`EXPIRED` |
| 6 | bị từ chối hiện ghi chú | reviewer từ chối một ca có note bằng `api.sh` | staff thấy "Bị từ chối" + đúng note |
| 7 | điện thoại | kịch bản 2, 5 với `--viewport 390x844` | không cuộn ngang (`document.documentElement.scrollWidth ≤ 390`, ghi trong JSON), danh sách dạng thẻ |
| 8 | hồi quy S2/S3 | `.verify/29/run.sh` (nạp lại 10 ca như plan 29) | `steps` toàn ok, `queue-done`; screenshot S3 không vỡ (nút có viền, bảng có kẻ) |
| 9 | sai vai trò | reviewer mở `/` | chuyển sang `/review` như cũ |

**Test mới phải đỏ trên code cũ:**
- `staffReason` ca "approved có routing LOW_CONFIDENCE → null": chạy với bản cài đặt giống biểu thức cũ (`reviewerReason(doc) ?? doc.routing?.reasons.join(", ")`) → ra `"LOW_CONFIDENCE"`, đỏ.
- `pollInterval` viết trước hàm → đỏ.
- `ui.mts --viewport` / `upload:` trên bản `main` → "không biết bước upload", exit 1.

**Thay đổi feature map:** mục S1 (testid giữ nguyên, thêm vùng kéo thả, badge, lý do tiếng Việt), `ui.mts --viewport`, `upload:`.

**Những gì sẽ KHÔNG kiểm, và lý do:**
- Kéo thả thật bằng chuột (Playwright không thả file từ hệ điều hành được): kiểm bằng `setInputFiles` trên input của vùng kéo thả; kéo thả tay để Liam kiểm ở phase cuối.
- Trình duyệt khác Chromium.
- Accessibility đầy đủ, bàn phím: plan 32.
- Liam kiểm tay T3: dồn phase cuối.

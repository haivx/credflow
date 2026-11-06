# 17 · Màn upload và kết quả thô (S1 tối giản)

Phase: P1 · Trạng thái: Đã duyệt · Ngày: 2026-11-06

## Mục tiêu

Hiện chỉ upload được bằng `curl` và xem kết quả bằng `psql`. Làm xong thì staff đăng nhập trên web, upload một giấy, thấy trạng thái tự cập nhật tới kết quả cuối, và xem được kết quả thô (classification, extraction, rule, routing). Đây là mảnh cuối của lát cắt dọc P1.

## Phạm vi

- **Trong:**
  - API: `GET /documents` (giấy của tôi) và `GET /documents/:id`, chỉ staff, chỉ giấy của chính mình.
  - Web: Next `rewrites` `/api/*` → API (ADR 0004); một trang `/` gộp login + upload + danh sách + kết quả thô; header có user và nút đăng xuất.
  - Trạng thái tự cập nhật bằng polling.
- **Ngoài:**
  - Kéo thả, chọn loại giấy có hướng dẫn, giao diện đẹp: để sau (P4 làm UI thật). Màn này là `<input type="file">` + `<select>` loại giấy.
  - Reviewer, admin: đăng nhập được nhưng chỉ thấy dòng "màn của vai trò này làm ở P4/P5".
  - Ảnh giấy, highlight `box`: S3, P4.
  - Script `ui.ts` của skill `verify` và e2e tự động: xem câu hỏi 4.

## Cần anh duyệt riêng

| # | Vấn đề | Đề xuất |
| --- | --- | --- |
| 1 | Response của 2 endpoint đọc: `DocumentRecord` có `storageKey`, `checksum` là chi tiết nội bộ | Contract mới `DocumentView = DocumentRecord.omit({ storageKey: true, checksum: true })`, và `DocumentList = { items: DocumentView[] }`. **Đổi contract** (thêm, không sửa cũ) |
| 2 | Staff mở `/documents/:id` của người khác | `404 NOT_FOUND`, giống id không tồn tại: không lộ việc giấy đó có thật. Reviewer, admin gọi → `403` (P4 mới mở) |
| 3 | Cập nhật trạng thái | Polling `GET /documents/:id` mỗi 2 giây khi status là `uploaded`, `processing`, `extracted`; dừng ở trạng thái cuối hoặc sau 2 phút. SSE/WebSocket ghi vào "Học nâng cao" |
| 4 | Kiểm L3 (UI) | Repo chưa có Playwright. Đề xuất: **lần này** kiểm L3 bằng Playwright MCP (đi màn thật, chụp screenshot vào evidence), chưa thêm dependency. Script `ui.ts` + e2e tự động làm ở plan riêng (đổi `package.json`, vùng kiến trúc) |

## Thiết kế

### API (`apps/api/src/documents/`)

- `GET /documents`: `@Roles("staff")`, `WHERE staff_id = session.staffId ORDER BY created_at DESC LIMIT 50`. Không phân trang ở P1.
- `GET /documents/:id`: `@Roles("staff")`, `WHERE id = :id AND staff_id = session.staffId`; không có → 404. `:id` parse bằng `Id` (Zod pipe sẵn có).
- Response parse qua `DocumentView` / `DocumentList` trước khi trả (A2, Zod ở ranh giới).
- Dùng index sẵn có trên `staff_id` nếu có; không có thì không thêm ở plan này (50 dòng, P3 mới làm query + `EXPLAIN`).

### Web (`apps/web/`)

- `next.config.mjs`: `rewrites` `/api/:path*` → `http://127.0.0.1:8787/:path*` (đọc `API_URL` từ env, mặc định như trên). Cookie đi cùng site `localhost:3000`.
- `app/page.tsx` (client component), chia component nhỏ trong `app/_components/`:
  - `LoginForm`: `POST /api/auth/login`; `GET /api/auth/me` khi mở trang để biết đã đăng nhập chưa.
  - `Header`: email, vai trò, nút đăng xuất (`POST /api/auth/logout`).
  - `UploadForm`: file + loại giấy tuỳ chọn → `POST /api/documents` (multipart). Hiện lỗi theo `ApiError.code`: 409, 413, 415, 400 bằng câu tiếng Việt; `duplicate: true` → "Bạn đã nộp file này rồi".
  - `DocumentList`: tên file, ngày nộp, nhãn trạng thái (Đang xử lý / Đã tự duyệt / Đang chờ duyệt / Không đọc được file), lý do (`routing.reasons`).
  - `DocumentDetail`: các bảng thô: classification (loại, confidence), extraction (trường, value, confidence, `quote`), ruleResults (mã, severity, qua/không, message), routing, `asOf`, `versions`, `timingMs`.
- `app/_lib/api.ts`: một hàm `apiFetch(path, schema)` parse response bằng schema contracts; lỗi → `ApiError`. Không `any`.
- Nhãn trạng thái là hàm thuần `statusLabel(status)` trong `app/_lib/status.ts`; không có test runner cho web nên kiểm qua L3 (xem câu hỏi 4).

## Thay đổi

| File | Thay đổi |
| --- | --- |
| `packages/contracts/src/routing.ts` | `DocumentView`, `DocumentList` (mục duyệt 1); fixture JSON tương ứng |
| `apps/api/src/documents/documents.controller.ts`, `documents.service.ts` | 2 route đọc |
| `apps/api/test/documents-read.int-spec.ts` (mới) | 401, 403, 404 giấy người khác, list chỉ giấy của mình, không lộ `storageKey`/`checksum` |
| `apps/web/next.config.mjs` | `rewrites` |
| `apps/web/app/page.tsx`, `app/_components/*`, `app/_lib/*` | màn S1 tối giản |
| `.claude/skills/verify/FEATURE_MAP.md` | mục S1, 2 route đọc |
| `docs/roadmap.md` | "Học nâng cao": SSE/WebSocket thay polling |

## Vùng kiến trúc bị chạm

- `packages/contracts/src/**` (`routing.ts`), fixture contracts.
- `.claude/skills/verify/**` (`FEATURE_MAP.md`).
- Không chạm `package.json` (không thêm dependency), `eslint.config.mjs`, DB schema, rule, prompt.

## Contract / config / prompt bị ảnh hưởng

- **Contract:** thêm `DocumentView`, `DocumentList`. Không sửa schema cũ.
- DB, config rule, prompt, model: không đổi.

## Quyết định đáng nhớ

- **Chỗ khó nhất:** cookie session phải đi cùng site với trang. Gọi thẳng `127.0.0.1:8787` từ `localhost:3000` là khác site, cookie không gửi; nên mọi request đi qua rewrite `/api/*`.
- **Đã loại:** Server Components + server actions đọc cookie rồi gọi API: ít JS hơn nhưng phải tự chuyển tiếp cookie ở server, thêm một lớp khó gỡ lỗi; client component + rewrite đơn giản hơn ở mức middle.
- **Đã loại:** trả nguyên `DocumentRecord`: lộ `storageKey` và `checksum`, và khoá chặt hình dạng API vào hình dạng DB.
- **Khi nào hỏng:** polling 2 giây với nhiều người dùng mở trang cùng lúc làm tăng tải API; ổn ở quy mô demo, thay bằng SSE khi cần (P5).

## Tiêu chí xong

- [ ] Staff đăng nhập trên web, upload thẻ 01, thấy trạng thái đi từ "Đang xử lý" tới "Đã tự duyệt" mà không bấm tải lại.
- [ ] Mở chi tiết thấy extraction kèm `quote`, 9 rule, routing, `asOf`, `versions`.
- [ ] Staff không xem được giấy của người khác (404); chưa đăng nhập → 401; reviewer gọi API đọc → 403.
- [ ] Upload trùng, file sai loại, file quá lớn hiện câu báo lỗi rõ.
- [ ] `make lint`, `make typecheck`, `make test`, `make test-int` xanh.
- [ ] Evidence report (skill `verify`) có trong PR, kết quả ✅ hoặc phần chưa kiểm đã được Liam chấp nhận.

## Rủi ro / câu hỏi

1. **Chi phí:** kiểm L3 với worker thật gọi Haiku khoảng 2–4 lượt upload. Có thể chạy worker với 01 đã ghi sẵn? Không: worker không có chế độ giả. Chấp nhận vài lượt gọi thật.
2. **Next 14 `rewrites` và multipart:** proxy phải chuyển nguyên body stream; nếu file lớn bị cắt hoặc giới hạn kích thước ở proxy, kiểm bằng file gần 10 MB (kịch bản 6).

## Verification plan

**Mức rủi ro:** T2: tính năng mới, thêm API đọc. Có chạm phân quyền (staff chỉ thấy giấy của mình), nên kiểm phân quyền ở L2 như T3; không đổi routing hay rule.

**Hành vi kỳ vọng:**

- Staff đăng nhập, chọn file, bấm nộp → giấy hiện ngay "Đang xử lý" → tự đổi sang kết quả cuối.
- Thẻ tốt đúng người → "Đã tự duyệt"; thẻ có vấn đề → "Đang chờ duyệt" kèm mã lý do.
- Staff chỉ thấy giấy của mình.

**Các mức kiểm:**

- [ ] L0: `make lint`, `make typecheck` (có `apps/web`).
- [ ] L1: `make test` (fixture contract mới parse qua schema).
- [ ] L2: `make test-int` cho 2 route đọc; gọi API đang chạy qua rewrite `localhost:3000/api/...` bằng `curl`.
- [ ] L3: Playwright MCP trên `http://localhost:3000`, screenshot từng bước vào `.verify/shots/`, đếm lỗi console và request lỗi.
- [ ] L2 Eval: không áp dụng (không đổi prompt, model, rule).
- [ ] L4: không áp dụng.

**Kịch bản:**

| # | Kịch bản | Input | Kết quả kỳ vọng |
| --- | --- | --- | --- |
| 1 | Chưa đăng nhập gọi `GET /documents`, `/documents/:id` (int) | không cookie | 401 |
| 2 | Reviewer gọi 2 route (int) | user reviewer | 403 |
| 3 | Staff A mở giấy của staff B; id không tồn tại (int) | 2 staff | cả hai 404, body giống nhau |
| 4 | List chỉ có giấy của mình, mới nhất trước, không có `storageKey`/`checksum` (int) | 2 staff, 3 giấy | đúng 2 giấy của A |
| 5 | Luồng chính trên web (L3) | `staff-marisol@`, `01-expires.png` | "Đang xử lý" → "Đã tự duyệt" không tải lại; chi tiết có 9 rule, `asOf` |
| 6 | Lỗi upload trên web (L3) | file `.txt` đổi đuôi `.png`; file 11 MB; upload lại 01 | câu báo 415, 413, "đã nộp rồi" |
| 7 | Thẻ cần duyệt (L3) | `staff-tobias@`, `02-valid-2-years.pdf` | "Đang chờ duyệt", lý do `MISSING_FIELD`, `EXPIRED` |
| 8 | Đăng xuất (L3) | bấm nút | về form login; `GET /api/auth/me` → 401 |
| 9 | Reviewer đăng nhập web (L3) | `reviewer@` | thấy dòng "làm ở P4", không có form upload |

**Test mới phải đỏ trên code cũ:** kịch bản 1–4: route chưa có → 404 thay vì 401/403/200 → đỏ. Cho thấy bằng cách chạy trước khi viết controller.

**Thay đổi feature map:** mục "Upload giấy" thêm UI S1; mục mới "Đọc giấy của tôi" (2 route).

**Những gì sẽ KHÔNG kiểm, và lý do:**

- E2E tự động trong CI: chưa có Playwright trong repo (câu hỏi 4).
- Nhiều tab polling cùng lúc, tải: quy mô demo.
- Trình duyệt khác Chromium: chỉ Playwright MCP Chromium.

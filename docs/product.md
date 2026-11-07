# CredFlow — Product Document

> Trạng thái: bản nháp v0.1 (2026-10-27). Liam chốt các mục "Quyết định còn mở" (mục 8) ở P0.
> Kiểu dữ liệu: `packages/contracts` là nguồn sự thật; file này chỉ tóm tắt.

## 1. Tổng quan

### Bài toán

Công ty dịch vụ chăm sóc hoặc trị liệu tại nhà (home care, ABA therapy…) có hàng trăm nhân viên. Mỗi người phải nộp và **giữ còn hạn** một bộ giấy tờ, khác nhau theo vai trò, theo khách hàng (client) và theo bang: chứng chỉ CPR, giấy phép hành nghề, xét nghiệm TB, kiểm tra lý lịch, giấy tiêm chủng…

Hiện tại nhân viên HR/compliance mở từng file, đọc, gõ tay ngày hết hạn vào hệ thống và tự nhớ nhắc gia hạn. Hậu quả:
- onboard người mới chậm, vì phải chờ duyệt giấy tờ;
- sót giấy hết hạn, rủi ro khi bị audit;
- tốn nhiều giờ làm việc lặp lại.

Giấy tờ **không có mẫu chuẩn**: cùng là thẻ CPR nhưng mỗi tổ chức đào tạo in một kiểu ("Renewal Date", "Expires", "Valid 2 years"…), xét nghiệm TB thì mỗi phòng khám một biểu mẫu. Vì vậy OCR theo template không giải quyết được. Đây là bài toán IDP (Intelligent Document Processing) gắn với một quy trình nghiệp vụ cụ thể.

### Vision

Giảm phần lớn việc đọc và gõ tay của compliance, nhưng **không bao giờ tự cho qua một giấy tờ sai**.

### Người dùng

| Vai trò | Việc chính |
| --- | --- |
| Nhân viên (staff) | Upload giấy tờ, xem trạng thái, nộp lại khi được yêu cầu |
| Người duyệt (reviewer, HR/compliance) | Xử lý hàng chờ: xem giấy cạnh trường đã trích xuất, sửa, duyệt, từ chối, yêu cầu nộp lại |
| Admin | Cấu hình rule theo khách hàng, xem dashboard compliance |

MVP có đăng nhập cơ bản: email + mật khẩu, session lưu ở DB, cookie `httpOnly`; mỗi user có đúng một vai trò (ADR 0004). User là dữ liệu giả lập seed sẵn; không có đăng ký, quên mật khẩu, SSO/OIDC.

### Nguyên tắc sản phẩm

1. **LLM chỉ đọc, code quyết định** (ADR 0002). LLM phân loại và trích xuất; rule engine deterministic kiểm tra; routing chỉ dựa trên kết quả rule.
2. **Precision trước recall.** Không chắc thì chuyển cho người. Tự duyệt ít còn hơn duyệt nhầm.
3. **Mọi trường có bằng chứng.** Người duyệt luôn thấy trường được đọc từ đâu trên giấy.
4. **Rule cấu hình được theo khách hàng**, không hard-code.
5. **Đo được.** Mọi thay đổi prompt/model/rule đi qua eval trên golden set.

### Phạm vi MVP

**Trong:** 5 loại giấy (CPR, giấy phép hành nghề, xét nghiệm TB, kiểm tra lý lịch, tiêm chủng); upload PDF/ảnh; phân loại; trích xuất kèm bằng chứng; rule engine; routing; hàng chờ và màn duyệt; lưu chỗ sửa; dashboard hết hạn; bộ sinh dữ liệu giả lập; eval harness; deploy demo.

**Ngoài:** SSO/OIDC, đăng ký tài khoản, quên mật khẩu, nhiều tenant, gửi email/SMS thật, tích hợp HRIS, xác minh trực tiếp với tổ chức cấp, giấy tờ tuỳ thân (bằng lái, ID), agent (xem mục 9), mobile app.

### Chỉ số thành công (trên golden set holdout)

| Metric | Mục tiêu MVP |
| --- | --- |
| `falseApproveRate` (ca phải người duyệt nhưng bị tự duyệt) | **0%** |
| Độ chính xác phân loại | ≥ 95% |
| Độ chính xác trường ngày hết hạn | ≥ 95% |
| `autoApproveRate` trên ca sạch | ≥ 60% |
| Độ trễ xử lý một giấy (p95) | ≤ 20 s |
| Chi phí một giấy | ghi nhận, chưa đặt mục tiêu |

## 2. Loại giấy

Chi tiết trường, cách tính hạn và ca khó của từng loại: `docs/doc-types.md`.

| Loại | Dạng | Thử thách chính |
| --- | --- | --- |
| `cpr_card` | Thẻ nhỏ, hay là ảnh chụp | Nhiều mẫu theo tổ chức; hạn có thể in sẵn hoặc chỉ ghi "Valid 2 years" |
| `professional_license` | Giấy chứng nhận có số | Mẫu theo bang/tổ chức; khớp tên |
| `tb_test` | Biểu mẫu y tế | Không in hạn, phải tự tính; có trường kết quả |
| `background_check` | Thư văn bản | Thông tin nằm trong câu chữ; kết quả clear/not clear |
| `vaccination_record` | Phiếu nhiều dòng | Nhiều mũi trên một tờ, chọn đúng mũi |

## 3. Pipeline

```
upload → [1] tiền xử lý → [2] phân loại (LLM) → [3] trích xuất (LLM) → [4] kiểm tra (code) → [5] routing (code) → auto_approved | needs_review
```

1. **Tiền xử lý** (code): PDF → ảnh từng trang, chuẩn hoá kích thước, xoay theo EXIF. Chưa làm: P1 gửi thẳng file gốc (ADR 0008), xem lại theo số liệu eval.
2. **Phân loại** (LLM vision): `{docType, confidence}`. `unknown` hoặc khác loại nhân viên khai → rule `WRONG_DOC_TYPE`.
3. **Trích xuất** (LLM vision, structured output): mỗi trường `{value, confidence, evidence: {quote, box?}}`. Ngày chuẩn hoá `YYYY-MM-DD`, chữ gốc giữ trong `quote`. Output parse bằng Zod; lỗi parse → retry tối đa 1 lần → `needs_review`.
4. **Kiểm tra** (rule engine thuần, `packages/rules`): xem mục 5.
5. **Routing** (code): chỉ `auto_approve` khi mọi rule `block` đều qua.

Chạy bất đồng bộ qua job queue; trạng thái `uploaded → processing → extracted → auto_approved | needs_review | failed`. Mỗi bước ghi `timingMs` và `versions`.

**OCR hay vision?** MVP dùng LLM vision đọc thẳng ảnh (gọn, hiểu bố cục). Rủi ro: bịa giá trị không có trên giấy → bắt buộc `evidence.quote` + eval. Phương án so sánh ở P5: OCR (lấy toạ độ chữ) + LLM, so trên cùng golden set (quyết định còn mở, mục 8).

## 4. Độ tự tin

`confidence` do LLM tự chấm **không đáng tin** nếu dùng một mình. Hệ thống kết hợp thêm kiểm tra bằng code:
- **Kiểm tra chéo logic:** hạn sau ngày cấp; hạn = ngày học + hiệu lực (khi có cả hai); ngày không nằm trong tương lai xa.
- **Bằng chứng tồn tại:** có `value` mà không có `evidence` → `MISSING_EVIDENCE`.
- **Ngưỡng theo cấu hình:** trường bắt buộc dưới `minFieldConfidence` → `LOW_CONFIDENCE`.
- (P5, tuỳ chọn) chạy trích xuất 2 lần hoặc 2 model, lệch nhau → chuyển cho người.

## 5. Rule engine

Hàm thuần `evaluateRules({extraction, classification, declaredDocType?, staff, config, asOf}) → RuleResult[]`. Mọi rule luôn được chấm; thiếu dữ liệu tính là không qua (ADR 0009). Mã rule (contract `RuleCode`):

| Mã | Severity | Khi nào không qua |
| --- | --- | --- |
| `WRONG_DOC_TYPE` | block | Phân loại `unknown` hoặc khác loại được khai |
| `MISSING_FIELD` | block | Trường bắt buộc của loại giấy là null |
| `MISSING_EVIDENCE` | block | Có value nhưng không có evidence |
| `LOW_CONFIDENCE` | block | Trường bắt buộc dưới `minFieldConfidence` |
| `DATE_INCONSISTENT` | block | Ngày mâu thuẫn nhau, vô lý, hoặc không xác định chắc từ chữ in: ngày số mà ngày và tháng đều ≤ 12 (`10/9/2025`), hoặc chỉ có tháng/năm ("Valid through 12/2027"). Code đọc `evidence.quote`, không tin ngày LLM điền (plan 21) |
| `EXPIRED` | block | Hạn (in sẵn hoặc tự tính) trước `asOf` |
| `EXPIRING_SOON` | info | Hết hạn trong `expiringSoonDays` ngày |
| `NAME_MISMATCH` | block | Tên trên giấy không khớp `legalName` hay `aliases` sau khi chuẩn hoá |
| `ISSUER_NOT_ACCEPTED` | block | Tổ chức cấp không có trong `acceptedIssuers` của khách hàng |
| `RESULT_NOT_PASSING` | block | TB không âm tính, background check không clear |
| `NO_RULES_EVALUATED` | block | Engine không chấm rule nào (lỗi hệ thống, không phải lỗi giấy). Chỉ `route()` trả mã này |

**So khớp tên:** chuẩn hoá (bỏ dấu, viết thường, đảo "LAST, FIRST", bỏ tên đệm viết tắt) rồi so với `legalName` và `aliases`. Không fuzzy-match lỏng: không khớp chắc thì `NAME_MISMATCH`, để người duyệt quyết.

**Cấu hình:** `config/rules/default.yaml` + `config/rules/clients/<clientId>.yaml` (plan 25, ADR 0011), mỗi file validate bằng `RulesConfig`, có `name` riêng và `dateOrder` (`MDY` / `DMY` / `strict`). Một giấy được chấm theo config của **mọi** khách hàng của staff; một rule chỉ qua khi qua ở mọi config (chặt nhất); staff không có khách hàng, hoặc khách hàng chưa có file → `default`. `versions.rules` ghi các config đã dùng (`bayleaf@1+sunrise@1`). Giá trị trong repo là minh hoạ. Rule nào áp cho loại giấy nào và severity của nó cố định trong code (`packages/rules/src/registry.ts`), khách hàng không đổi được. Lúc khởi động, `assertRulesReady` kiểm mọi loại giấy mà `roles` yêu cầu đều có ít nhất một rule `block` và mã không trùng; sai thì app không chạy.

## 6. Màn hình và luồng

Xem `docs/flows.md`. Các màn chính:
- **Upload** (staff): chọn loại giấy, kéo thả file, thấy trạng thái.
- **Hàng chờ** (reviewer): lọc theo lý do, sắp xếp theo hạn/ngày nộp.
- **Màn duyệt** (reviewer, màn quan trọng nhất): ảnh giấy bên trái; trường đã trích xuất bên phải, mỗi trường có `quote` và vùng highlight (khi có `box`); danh sách rule không qua kèm giải thích; sửa trường inline; duyệt / từ chối / yêu cầu nộp lại.
- **Dashboard** (admin): tình trạng compliance theo nhân viên, giấy sắp hết hạn.

## 7. Eval

- **Golden set:** ~100 giấy giả lập do `tools/synth` sinh, đáp án có sẵn (`GoldenCase`). Cộng 10–20 ca khó làm tay trong `eval/hard-cases/`. Chia `dev` (dùng khi phát triển) và `holdout` (chỉ chạy khi chốt kết quả).
- **Metric:** `EvalMetrics` trong contract, cắt theo `CaseTag` (rotated, blurred, name_variant…).
- **Regression:** `make eval` ghi `eval/runs/<id>.json` và `eval/report.md` so với lần chạy trước; dán vào PR.
- **Từ người duyệt:** mọi `ReviewAction.corrections` là dữ liệu cho biết hệ thống sai ở đâu (P4 trở đi).
- **Giới hạn đã biết:** dữ liệu giả lập dễ hơn thực tế, nên số liệu là cận trên. Ghi rõ trong writeup.

## 8. Kiến trúc và stack

| Lớp | Lựa chọn | Trạng thái |
| --- | --- | --- |
| Monorepo | pnpm workspace, TypeScript strict | Chấp nhận (ADR 0001) |
| Web | Next.js 14 (App Router), Tailwind + shadcn/ui, TanStack Query | Chấp nhận |
| API | NestJS trên Node; HTTP và worker là hai entrypoint | Chấp nhận |
| DB | Postgres 16 (docker compose), Drizzle ORM; nguồn sự thật cho trạng thái | Chấp nhận |
| Job queue | BullMQ + Redis 7 (`noeviction`); dual-write xử lý bằng sweep job (ADR 0001) | Chấp nhận |
| Đăng nhập | Email + mật khẩu (scrypt), session trong Postgres, cookie `httpOnly`; guard toàn cục + `@Roles` | Chấp nhận (ADR 0004) |
| Lưu file | Dev: file system local (`DATA_DIR`). Production: Railway Bucket (S3) qua `S3Storage`, chọn bằng `STORAGE_DRIVER` | Chấp nhận (ADR 0013) |
| LLM | `claude-haiku-5-5`, vision + structured output (ADR 0008); đo lại bằng eval ở P2 | Chấp nhận |
| Contract | Zod 4 trong `packages/contracts` | Chấp nhận |
| Eval | TypeScript (`eval/`) | Chấp nhận |
| Deploy | Railway (Singapore): web, api, worker, Postgres, Redis, Bucket; chỉ web công khai; migration bằng pre-deploy | Chấp nhận (ADR 0013) |

### Quyết định còn mở (chốt ở P0, trừ khi ghi khác)

1. ~~Chốt contract bản nháp trong `packages/contracts`~~ Đã chốt `common`, `document`, `routing`, `staff` 2026-11-03 (plan 07); `extraction`, `rules` chốt ở P1, `eval` ở P2.
2. ~~Stack trong bảng trên~~ Đã chốt 2026-10-29 (ADR 0001).
3. ~~Model LLM và nhà cung cấp (P1).~~ Đã chốt 2026-11-05: `claude-haiku-5-5` (ADR 0008).
4. ~~Có cho phép **tự từ chối** ca chắc chắn hết hạn không?~~ Đã chốt 2026-11-03: **không**. Mọi ca không qua đều vào hàng chờ; người duyệt từ chối (hàng chờ lọc theo lý do, P4).
5. Vision thuần hay OCR + LLM cho bản cuối (P5, quyết theo số liệu eval).
6. ~~Nơi deploy và lưu file khi demo (P6).~~ Đã chốt 2026-11-07: Railway, file trên Railway Bucket (ADR 0013).

## 9. Ngoài phạm vi, để sau

- **Agent:** tạm thời không dùng. Ứng viên nếu làm sau: agent thử lại ca khó có giới hạn (xoay/cắt/OCR/model thứ hai), trợ lý cho người duyệt chỉ có tool đọc và soạn nháp (không có tool duyệt), agent chuyển yêu cầu bằng lời thành rule YAML.
- Nhắc gia hạn qua email/SMS, nhiều tenant, xác minh với tổ chức cấp, audit log đầy đủ.

## 10. Rủi ro

| Rủi ro | Giảm thiểu |
| --- | --- |
| LLM bịa giá trị | Bắt buộc evidence, kiểm tra chéo, eval theo trường |
| Dữ liệu giả lập quá dễ, số liệu đẹp giả | Nhiễu mạnh, ca khó làm tay, holdout, ghi giới hạn trong writeup |
| Phình phạm vi | Giữ cứng 5 loại giấy đến hết P6; làm lát cắt CPR end-to-end trước |
| Lệch múi giờ khi tính hạn | Ngày là chuỗi `YYYY-MM-DD`, `asOf` truyền vào |
| Dùng nhầm dữ liệu thật | `docs/data-policy.md`, `real-docs/` trong `.gitignore` |

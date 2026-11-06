# 16 · Nối rule và routing vào pipeline

Phase: P1 · Trạng thái: Đã duyệt · Ngày: 2026-11-06

## Mục tiêu

Hiện `LlmPipeline` gọi `route([])` nên mọi giấy vào `needs_review`. Làm xong thì worker chạy `evaluateRules` trên kết quả trích xuất, đi đủ `processing → extracted → auto_approved | needs_review`, và lần đầu có đường tới `auto_approved` thật. 6 fixture (5 CPR + 1 TB) chạy end-to-end qua API thật.

## Phạm vi

- **Trong:** bước rule trong worker, trạng thái `extracted`, `asOf` theo ngày UTC, staff seed khớp fixture, fixture CPR thứ 5, int test end-to-end, chạy thật với Haiku.
- **Ngoài:**
  - Màn upload và hiển thị kết quả thô: plan 17 (Liam 2026-11-06: tách).
  - Rule cho loại giấy khác CPR: P3, P5. Vẫn ra `NO_RULES_EVALUATED`.
  - `make eval`: P2.

## Quyết định của Liam (2026-11-06)

1. Tách backend (plan 16) và màn web (plan 17).
2. Thêm staff hư cấu vào seed cho khớp tên fixture, không đổi fixture.
3. `asOf` = ngày UTC lúc chạy rule, có lưu để tái lập. Ghi ADR 0010.
4. Làm thêm fixture CPR thứ 5 có bố cục mới, ghi output Haiku một lần.

## Cần anh duyệt riêng

| # | Vấn đề | Đề xuất |
| --- | --- | --- |
| 1 | Lưu `asOf` cần chỗ chứa: contract và bảng `documents` chưa có | Thêm `asOf: IsoDate.optional()` vào `DocumentRecord`, cột `as_of` (`date`, mode string) và migration. **Đổi contract và schema DB** |
| 2 | Có cần ràng buộc DB cho `asOf` không | CHECK C6: `auto_approved` thì `as_of IS NOT NULL`. Thêm test vào `db-constraints.int-spec.ts` |
| 3 | Worker chết sau khi ghi `extracted`, trước khi ghi kết quả rule | Job retry (hoặc stalled) thấy `extracted` thì chạy lại bước rule (thuần, không gọi LLM). Sweep coi `extracted` quá hạn giống `processing` quá hạn: chuyển `needs_review` |
| 4 | Ai chạy rule: `LlmPipeline` hay worker | Worker (`DocumentProcessor`) qua `RuleStep` mới. Pipeline chỉ lo đọc file và gọi LLM, nên bước rule chạy lại được mà không gọi LLM (mục 3) |

## Thiết kế

### Luồng trong `DocumentProcessor`

```
uploaded → processing (ghi versions)
pipeline.run():
  CPR có extraction → { status: "extracted", classification, extraction, timingMs }
  không phải CPR, hoặc LLM lỗi không đáng retry → { status: "needs_review", route([]) , ... } như hiện tại
processing → extracted (ghi classification, extraction, timingMs)
RuleStep.run(documentId):
  đọc document (extraction, classification, declaredDocType, staffId) + staff
  asOf = clock.todayUtc()
  ruleResults = evaluateRules({ ..., config, asOf }); routing = route(ruleResults)
  extracted → auto_approved | needs_review (ghi ruleResults, routing, asOf, timingMs.rules)
```

- Status `extracted` khi vào `handle`: chỉ chạy `RuleStep`, không gọi pipeline.
- `decision` → status: `auto_approve` → `auto_approved`, `needs_review` → `needs_review`. Không có nhánh nào khác.
- Lỗi trong `RuleStep` (ví dụ staff không tồn tại): retry theo job; hết lượt thì `extracted → needs_review` kèm `error.step = "rules"`, message cố định (A14).
- `CLOCK` provider (`apps/api/src/common/clock.ts`): `todayUtc(): string` = `new Date().toISOString().slice(0, 10)`. Test thay bằng ngày cố định. `packages/rules` vẫn không đụng `Date`.
- `PIPELINE_VERSIONS.pipeline` → `"16"`.

### Staff và fixture

- Seed thêm 3 staff hư cấu và 3 user đăng nhập vai trò staff (`staff-<tên>@example.test`): Marisol Quennell, Tobias Arkwright-Lenz, Odalys Venn. Id cố định, `make db-seed` vẫn idempotent.
- Fixture `06-wallet-signature.html` → `.png`: thẻ CPR khổ ví, nằm ngang, có ô chữ ký, watermark SAMPLE. Tên `Maren Ostrowe` (staff seed sẵn), tổ chức `Northbridge Safety Council`, còn hạn tới 2028. Kỳ vọng `auto_approve`. Bố cục khác 01, 02, 03.
- Ghi output Haiku của 06 vào `recorded/06-wallet-signature.json`, thêm vào `expected.json` và `recorded.test.ts`.

## Thay đổi

| File | Thay đổi |
| --- | --- |
| `packages/contracts/src/routing.ts` | `DocumentRecord.asOf` (mục duyệt 1) |
| `apps/api/src/db/schema.ts`, `apps/api/drizzle/*` | cột `as_of`, CHECK C6, migration sinh bằng `make db-generate` |
| `apps/api/src/pipeline/pipeline.ts`, `llm-pipeline.ts` | `PipelineResult` có nhánh `extracted`; bỏ `needsReview` cho ca CPR đọc được |
| `apps/api/src/rules/rule-step.ts` (mới) | đọc document + staff, `evaluateRules`, `route` |
| `apps/api/src/common/clock.ts` (mới) | `CLOCK` provider |
| `apps/api/src/worker/document-processor.ts` | 2 transition, nhánh `extracted`, hết retry ở `extracted` |
| `apps/api/src/worker/document-sweep.service.ts` | `extracted` quá hạn → `needs_review` |
| `apps/api/src/documents/document-status.service.ts` | `TransitionFields.asOf` |
| `apps/api/src/worker.module.ts` | đăng ký `RuleStep`, `CLOCK` |
| `apps/api/scripts/seed-data.ts` | 3 staff + 3 user |
| `apps/api/test/pipeline-rules.int-spec.ts` (mới) | end-to-end với LLM giả trả output đã ghi |
| `apps/api/test/db-constraints.int-spec.ts`, `sweep.int-spec.ts`, `worker.int-spec.ts` | C6, sweep `extracted`, resume `extracted` |
| `eval/hard-cases/cpr/06-wallet-signature.*`, `expected.json`, `recorded/` | fixture mới |
| `packages/rules/src/recorded.test.ts` | thêm 06 |
| `docs/decisions/0010-asof-ngay-utc.md` (mới) | ADR `asOf` |
| `.claude/skills/verify/FEATURE_MAP.md` | dòng cho routing thật |

## Vùng kiến trúc bị chạm

- `packages/contracts/src/**` (`routing.ts`)
- `apps/api/src/db/schema.ts`, `apps/api/drizzle/**`
- `apps/api/test/db-constraints.int-spec.ts`
- `.claude/skills/verify/**` (`FEATURE_MAP.md`)

Không chạm `config/rules/**`, prompt, model, `packages/rules/src/route.invariants.test.ts`, `purity.test.ts`.

## Contract / config / prompt bị ảnh hưởng

- **Contract:** thêm trường tuỳ chọn `DocumentRecord.asOf`. Không đổi trường cũ.
- **Schema DB:** cột `as_of` nullable + CHECK C6.
- Config rule, prompt, model: không đổi.

## Quyết định đáng nhớ

- **Chỗ khó nhất:** hai lần ghi (`extracted`, rồi kết quả rule) không nằm trong một transaction, nên phải có đường đi tiếp từ `extracted` (job retry chạy lại bước rule; sweep vét ca job mất). Bước rule thuần và rẻ nên chạy lại an toàn.
- **Đã loại:** chạy rule trong `LlmPipeline` rồi ghi một lần `processing → auto_approved`: gọn hơn nhưng bỏ qua `extracted` trong state machine, và retry sau khi chết sẽ gọi LLM lại.
- **Đã loại:** `asOf` theo múi giờ của khách hàng: đúng hơn ở ngày biên nhưng cần config múi giờ chưa có. Ngày UTC lệch tối đa 1 ngày. Với khách ở Mỹ (sau UTC), ngày UTC luôn bằng hoặc sau ngày địa phương (California từ 16h–17h), nên chỉ chặt hơn: thẻ hết hạn đúng hôm nay giờ địa phương có thể bị báo `EXPIRED` sớm vài giờ, không bao giờ cho qua thẻ đã hết hạn. Với múi giờ trước UTC thì ngược lại, có thể lỏng đi 1 ngày: ghi trong ADR, xem lại ở P3.
- **Khi nào hỏng:** khi có nhiều worker đặt `asOf` khác nhau quanh nửa đêm UTC: kết quả vẫn đúng với `asOf` đã lưu, nên vẫn tái lập được.

## Tiêu chí xong

- [ ] Thẻ CPR tốt, đúng người, upload qua API đi tới `auto_approved`, có `ruleResults`, `routing`, `asOf`, `versions.pipeline = "16"`, `timingMs.rules`.
- [ ] Mọi ca có rule `block` không qua tới `needs_review` với `routing.reasons` đúng.
- [ ] Worker chết ở `extracted` (giả lập) → job retry đưa document tới trạng thái cuối, không gọi LLM thêm.
- [ ] `extracted` quá hạn → sweep chuyển `needs_review`.
- [ ] 6 fixture chạy thật qua API + worker + Haiku, kết quả khớp bảng kỳ vọng (hoặc lệch được ghi lại và giải thích).
- [ ] `make lint`, `make typecheck`, `make test`, `make test-int` xanh.
- [ ] Evidence report (skill `verify`) có trong PR, kết quả ✅ hoặc phần chưa kiểm đã được Liam chấp nhận.

## Rủi ro / câu hỏi

1. **Output Haiku thật có thể khác lần ghi ở plan 14** (ví dụ confidence của 03). Chạy thật dùng để quan sát, không so nguyên văn. Int test dùng output đã ghi nên ổn định.
2. **Chi phí:** chạy thật 6 fixture khoảng $0.005, cộng ghi 06. Tổng đã dùng khoảng $0.004.
3. **Upload phải đăng nhập đúng staff:** `staffId` lấy từ session, nên mỗi fixture upload bằng user của staff đó. 04 (TB) và 06 upload bằng `staff@example.test` (Maren Ostrowe).

## Verification plan

**Mức rủi ro:** T3: lần đầu rule quyết định `auto_approved` trong hệ thống đang chạy; ảnh hưởng trực tiếp `falseApproveRate`. **Anh cần tự chạy hoặc xem chạy ít nhất một lần:** kịch bản 7 (upload thật 6 fixture).

**Hành vi kỳ vọng:**

- Thẻ CPR còn hạn, đúng tên staff đang đăng nhập, tổ chức được chấp nhận → `auto_approved`.
- Thiếu, nghi ngờ hoặc sai bất kỳ điều gì → `needs_review` kèm lý do. Không bao giờ `rejected`.
- Giấy không phải CPR → `needs_review`, lý do `NO_RULES_EVALUATED`.
- Worker chết giữa chừng → document không kẹt ở `extracted`.

**Các mức kiểm:**

- [ ] L0: `make lint`, `make typecheck`.
- [ ] L1: `make test`: `recorded.test.ts` thêm 06; unit test `RuleStep` (decision → status, lỗi staff không tồn tại).
- [ ] L2: `make test-int`: `pipeline-rules.int-spec.ts` (LLM giả trả output đã ghi, `CLOCK` cố định `2026-11-06`), C6, sweep, resume. Gọi API đang chạy với Haiku thật (kịch bản 7).
- [ ] L2 Eval: chưa có `make eval` (P2). Không đổi rule, prompt, model, ngưỡng. Thay bằng kịch bản 7.
- [ ] L3: không áp dụng, chưa có màn web (plan 17).
- [ ] L4: không áp dụng.

**Kịch bản:**

| # | Kịch bản | Input | Kết quả kỳ vọng |
| --- | --- | --- | --- |
| 1 | Thẻ tốt (int, LLM giả) | `recorded/01`, staff Marisol, asOf `2026-11-06` | `auto_approved`, `routing.reasons = []`, `as_of = 2026-11-06`, `timingMs.rules` có |
| 2 | Có rule block không qua (int) | `recorded/02`, `03`, `05` | `needs_review`, reasons đúng như bảng plan 15 |
| 3 | Sai người (int) | `recorded/01` upload bằng user Maren | `needs_review`, `NAME_MISMATCH` |
| 4 | Không phải CPR (int) | classification `tb_test` | `needs_review`, `NO_RULES_EVALUATED`, không có `extracted` |
| 5 | Chết ở `extracted` (int) | `RuleStep` ném lỗi lần 1, qua lần 2 | tới trạng thái cuối; LLM giả chỉ được gọi 1 lần mỗi bước |
| 6 | `extracted` quá hạn (int) | dòng `extracted`, `updatedAt` cũ | sweep → `needs_review`, `error.step = "sweep"` |
| 7 | Chạy thật (L2, Haiku) | `make dev`, upload 6 fixture bằng `curl` đúng user | bảng dưới |
| 8 | C6 (int) | ghi `auto_approved` thiếu `as_of` thẳng vào DB | Postgres từ chối |
| 9 | Hết retry ở `extracted` (int) | `RuleStep` luôn lỗi | `needs_review`, `error.step = "rules"`, message cố định |

**Kỳ vọng kịch bản 7** (asOf = ngày UTC hôm chạy, giả định 2026-11-0x):

| Fixture | Upload bằng | Status | `routing.reasons` |
| --- | --- | --- | --- |
| `01-expires` | Marisol | `auto_approved` | `[]` |
| `02-valid-2-years` | Tobias | `needs_review` | `MISSING_FIELD`, `EXPIRED` |
| `03-renewal-month` | Marisol | `needs_review` | `LOW_CONFIDENCE` (có thể khác nếu Haiku đổi confidence, ghi lại) |
| `04-tb-test` | Maren | `needs_review` | `NO_RULES_EVALUATED` |
| `05-injection` | Odalys | `needs_review` | `ISSUER_NOT_ACCEPTED` |
| `06-wallet-signature` | Maren | `auto_approved` | `[]` |

Bất biến kiểm trên mọi dòng: `auto_approved` chỉ khi mọi rule `block` qua; không dòng nào `rejected`; không dòng nào kẹt ở `processing`/`extracted`.

**Test mới phải đỏ trên code cũ:**

- Kịch bản 1: trên code cũ ra `needs_review` (`route([])`) → đỏ. Chạy trước khi nối `RuleStep`.
- Kịch bản 5, 6, 9: chưa có nhánh `extracted` → đỏ.
- Kịch bản 8: trước khi có migration C6 → đỏ.
- Phá `RuleStep` cho `decision` luôn `auto_approve` → kịch bản 2, 3 đỏ, CHECK C1–C3 ở DB cũng phải bắt.

**Thay đổi feature map:** thêm dòng "Routing thật (rule → `auto_approved`/`needs_review`)": cách chạy kịch bản 7.

**Những gì sẽ KHÔNG kiểm, và lý do:**

- `asOf` ở biên nửa đêm UTC với nhiều worker: chỉ ghi trong ADR, chưa có nhiều worker.
- Ngày dạng `09/02/2025`: Liam đã quyết để sau.
- Màn web: plan 17.

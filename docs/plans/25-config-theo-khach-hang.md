# 25 · Config rule theo từng khách hàng, `dateOrder`

Phase: P3 · Trạng thái: Đã duyệt (Liam 2026-11-06: "cứ complete những phase") · Ngày: 2026-11-06

## Mục tiêu

Hiện mọi giấy chấm theo một file `config/rules/default.yaml`. Khách hàng khác nhau chấp nhận tổ chức cấp khác nhau và đọc ngày khác nhau (khách ở Mỹ đọc `3/9/2026` là ngày 9 tháng 3). Làm xong thì mỗi khách hàng có file config riêng; một giấy được chấm theo config của **mọi** khách hàng của staff và chỉ tự duyệt khi qua hết; config có `dateOrder` để ngày số D/M ≤ 12 hết mơ hồ với khách `MDY`.

## Phạm vi

- **Trong:** contract `RulesConfig` (`name`, `dateOrder`); nạp `default.yaml` + `config/rules/clients/<clientId>.yaml`; chấm theo nhiều config, gộp chặt nhất; `dateOrder` trong `quoteDateProblem` (và kiểm ngày LLM điền khớp thứ tự đó); `versions.rules` theo config đã dùng; eval dùng cùng cách chấm; 2 ca khó mới (4 `GoldenCase`) đo nhánh mới; ADR 0011.
- **Ngoài:** "staff đã đủ bộ giấy" (plan 26); màn sửa config (MVP sửa file); `roles` khác nhau theo khách hàng (đọc được nhưng chưa dùng tới plan 26).

## Quyết định của Liam (2026-11-06, "làm theo đề xuất")

1. Chấm theo config của **từng** khách hàng của staff; một rule không qua ở bất kỳ config nào thì không qua; staff không có khách hàng → `default`. Không đổi contract document.
2. `dateOrder: MDY | DMY | strict` trong config, mặc định `strict` (hành vi plan 21).
3. `versions.rules` ghi các config đã dùng, sắp cố định: `default@1`, `bayleaf@1+sunrise@1`.
4. Golden set cũ giữ chấm theo `default`; thêm ca có `clientIds` để đo nhánh mới.

## Cần anh duyệt riêng

| # | Vấn đề | Đề xuất |
| --- | --- | --- |
| 1 | `versions.rules` cần tên dễ đọc ("sunrise"), file đặt theo `clientId` | Thêm trường `name` (bắt buộc) vào `RulesConfig`; `default.yaml` có `name: default`. File khách hàng: `config/rules/clients/<clientId>.yaml` |
| 2 | Config khách hàng viết đầy đủ hay chỉ phần khác | **Đầy đủ** (mỗi file tự validate được, không có luật gộp ngầm). Trùng lặp chấp nhận được với 2 khách hàng |
| 3 | `dateOrder: MDY` mà LLM điền theo thứ tự khác | Code tự đọc lại: quote `3/9/2026` với `MDY` phải ra `2026-03-09`; LLM điền `2026-09-03` → `DATE_INCONSISTENT` ("ngày điền không khớp chữ in theo thứ tự của khách hàng") |
| 4 | Message khi gộp nhiều config | Rule không qua lấy message của config đầu tiên không qua, thêm tiền tố tên config: "[bayleaf] Tổ chức cấp không nằm trong danh sách…" |
| 5 | `clientIds` trỏ tới khách hàng không có file config | Dùng `default` cho khách hàng đó (staff seed hiện có 2 khách, cả 2 sẽ có file). Ghi log `warn` một lần lúc nạp |
| 6 | `versions` ghi lúc vào `processing` (trước khi biết staff) | Giữ ghi lúc đó với `rules` = tên config sẽ dùng, tính từ staff ngay lúc ấy (processor đọc `staffId` → `clientIds`) |

## Thiết kế

### Contract (`packages/contracts/src/rules.ts`)

```ts
RulesConfig = z.object({
  version: z.literal(1),
  name: z.string().regex(/^[a-z0-9-]+$/),          // mới
  dateOrder: z.enum(["MDY", "DMY", "strict"]).default("strict"), // mới
  ...như cũ
})
```

### Config

- `config/rules/default.yaml`: thêm `name: default`, `dateOrder: strict`.
- `config/rules/clients/01M6CRWH00M3S97971WJSR6NX9.yaml` (Sunrise, hư cấu): như default, `name: sunrise`, `dateOrder: MDY`.
- `config/rules/clients/01M6CRWH00M3S97971WJSR6NXA.yaml` (Bayleaf, hư cấu): như default, `name: bayleaf`, `acceptedIssuers.cpr_card` thêm "Harrowgate First Aid Academy".

### `packages/rules`

- `loadRulesConfigSet(dir)` (`config.ts`): đọc `default.yaml` + mọi file trong `clients/`, validate từng file, `name` không trùng; trả `{ default, byClient: Record<clientId, RulesConfig> }`.
- `configsFor(set, clientIds)`: config theo `clientIds` (thiếu file → `default`), bỏ trùng, sắp theo `name`.
- `evaluateRulesForConfigs(input, configs)` (`engine.ts`, hàm thuần): chạy `evaluateRules` với từng config; mỗi mã rule `passed` = qua ở mọi config; message/fieldRefs của config đầu tiên không qua kèm tiền tố tên. Một config → kết quả y như `evaluateRules`.
- `quoteDateProblem(quote, order, value?)`: `strict` như hiện tại; `MDY`/`DMY` không báo `ambiguous_order`, nhưng nếu có `value` mà quote chỉ có một ngày số thì ngày đó đọc theo `order` phải bằng `value`, khác → `order_mismatch`.
- `assertRulesReady` chạy cho từng config.

### `apps/api`

- `RULES_CONFIG` provider trả `RulesConfigSet` (đọc thư mục từ `RULES_CONFIG_PATH`, nay là thư mục `config/rules`). Đổi mặc định env.
- `DocumentProcessor` (lúc vào `processing`): `versions.rules` = `rulesVersion(configsFor(set, staff.clientIds))`.
- `RuleStep`: `evaluateRulesForConfigs(…, configsFor(set, staff.clientIds))`.
- Eval (`scripts/eval.ts`, `run-case.ts`): dùng `configsFor(set, gc.staff.clientIds)`; `versions.rules` của run ghi tập config đã dùng.

### Ca khó mới (2 thẻ, 4 ca)

| Ca | Thẻ | Staff (`clientIds`) | Đáp án |
| --- | --- | --- | --- |
| `11-mdy-date` | "Completed 3/9/2026", "Expires 3/9/2028", tổ chức được chấp nhận ở mọi config | Maren, [Sunrise] (`MDY`) | `auto_approve` |
| `11-mdy-date-default` | cùng file | Maren, [] (`strict`) | `needs_review` |
| `12-issuer-bayleaf` | tổ chức "Harrowgate First Aid Academy", ngày rõ ràng | Odalys, [Bayleaf] | `auto_approve` |
| `12-issuer-two-clients` | cùng file | Odalys, [Sunrise, Bayleaf] | `needs_review` (Sunrise không chấp nhận) |

Hai thẻ mới gọi Haiku 1 lần mỗi thẻ (4 lượt, ≈ $0.002); ca thứ hai của mỗi thẻ dùng lại cache.

## Thay đổi

| File | Thay đổi |
| --- | --- |
| `packages/contracts/src/rules.ts`, `fixtures/*` liên quan | `name`, `dateOrder` |
| `config/rules/default.yaml`, `config/rules/clients/*.yaml` | thêm trường; 2 file khách hàng |
| `packages/rules/src/{config,engine,date-quote,cpr,ready,index}.ts` + test | như thiết kế |
| `apps/api/src/rules/{rules-config.provider,rule-step}.ts`, `worker/document-processor.ts`, `config/env.schema.ts` + test, int test | như thiết kế |
| `apps/api/scripts/eval.ts`, `apps/api/src/eval/run-case.ts` + spec | config theo staff |
| `eval/hard-cases/cpr/11…, 12….html/.png`, `cases.json`, `eval/recorded/*` | ca mới |
| `docs/product.md`, `docs/decisions/0011-config-theo-khach-hang.md` | spec, ADR |
| `.claude/skills/verify/FEATURE_MAP.md`, `docs/STATUS.md` | mô tả, baseline |

## Vùng kiến trúc bị chạm

- `packages/contracts/src/rules.ts`
- `config/rules/**`
- `.claude/skills/verify/FEATURE_MAP.md`

## Contract / config / prompt bị ảnh hưởng

- **Contract:** `RulesConfig` thêm `name` (bắt buộc), `dateOrder` (mặc định `strict`).
- **Config:** `default.yaml` thêm 2 trường; 2 file khách hàng mới (dữ liệu hư cấu).
- Prompt, model: không đổi.

## Quyết định đáng nhớ

- **Chỗ khó nhất:** một giấy không biết thuộc khách hàng nào. Chấm theo mọi khách hàng của staff và lấy chặt nhất: không bao giờ tự duyệt theo config lỏng hơn của một khách hàng mà khách hàng khác không chấp nhận.
- **Đã loại:** `clientId` trên document do staff chọn: phải đổi contract/DB/màn upload, và chọn sai thì tự duyệt theo config lỏng.
- **Đã loại:** config khách hàng chỉ ghi phần khác default: ngắn hơn nhưng có luật gộp ngầm (mảng ghi đè hay nối?), khó review.
- **Khi nào hỏng:** staff làm cho nhiều khách hàng có chính sách trái nhau (một khách `MDY`, một khách `DMY`): ngày D/M ≤ 12 luôn bị một bên chặn → luôn chuyển người duyệt. Đúng với nguyên tắc "không chắc thì chuyển người".

## Tiêu chí xong

- [ ] Config sai schema hoặc trùng `name` → API và worker không khởi động.
- [ ] Unit test: gộp nhiều config (qua hết / một config trượt / một config), `dateOrder` 3 giá trị × quote mơ hồ/không, `order_mismatch`.
- [ ] Golden set cũ (40 ca dev, `default`): kết quả y như plan 24 (0/40, 57.5%); `eval-ci` cổng 0 xanh với 44 ca.
- [ ] 4 ca mới ra đúng đáp án.
- [ ] Chạy thật: upload thẻ 11 bằng Maren (Sunrise) qua API + worker → `auto_approved`, `versions.rules` = `sunrise@1`.
- [ ] `make lint`, `make typecheck`, `make test`, `make test-int` xanh; CI xanh.
- [ ] Evidence report trong PR.

## Rủi ro / câu hỏi

1. **Staff seed Maren có `clientIds` [Sunrise]:** sau plan này, giấy thật của Maren chấm theo Sunrise (`MDY`) thay vì default. Golden set hard-cases để `clientIds` [] nên eval cũ không đổi; hành vi trên app dev đổi đúng ý.
2. **Chi phí:** khoảng $0.003 (4 lượt eval + 2 lượt chạy thật).

## Verification plan

**Mức rủi ro:** T3: đổi contract, config và cách chấm rule ảnh hưởng routing.

**Liam tự chạy:** để phase cuối (Liam 2026-11-06). Claude vẫn tự chạy đủ kịch bản, kể cả kịch bản 9.

**Hành vi kỳ vọng:**

- Thẻ của tổ chức chỉ một khách hàng chấp nhận: tự duyệt cho staff chỉ làm cho khách đó; chuyển người duyệt nếu staff còn làm cho khách khác không chấp nhận.
- Khách `MDY`: `3/9/2026` hiểu là 9 tháng 3, tự duyệt nếu mọi thứ khác qua; LLM điền ngược → chuyển người duyệt.
- Mọi thứ khác như cũ.

**Các mức kiểm:**

- [ ] L0: `make lint`, `make typecheck`.
- [ ] L1: `make test` (contracts, rules, api).
- [ ] L2: `make test-int` (provider nạp thư mục, RuleStep với 2 khách hàng); chạy thật bằng script verify (kịch bản 9).
- [ ] L2 Eval: `make eval` (4 ca mới gọi LLM), `--record`, `make eval-ci`; so 40 ca cũ trước/sau.

**Kịch bản:**

| # | Kịch bản | Kết quả kỳ vọng |
| --- | --- | --- |
| 1 | `evaluateRulesForConfigs` một config | giống `evaluateRules` từng phần tử |
| 2 | Hai config, issuer chỉ config B chấp nhận | `ISSUER_NOT_ACCEPTED` không qua, message có tiền tố tên config A |
| 3 | `quoteDateProblem("3/9/2026", "MDY", "2026-03-09")` / `"2026-09-03"` / `"strict"` / `"DMY", "2026-09-03"` | `undefined` / `order_mismatch` / `ambiguous_order` / `undefined` |
| 4 | `configsFor`: [], [Sunrise], [Sunrise, Bayleaf], [khách không có file] | [default] / [sunrise] / [bayleaf, sunrise] / [default] |
| 5 | File client sai schema, `name` trùng | không khởi động, báo đúng file |
| 6 | 40 ca dev cũ | không ca nào đổi decision |
| 7 | 4 ca mới | đúng bảng ca khó |
| 8 | `make eval-ci` 44 ca | 0 duyệt nhầm, cổng xanh |
| 9 | `up.sh` → `api.sh --as staff@example.test` (Maren, Sunrise) upload thẻ 11 → `GET` (`API_BODY_LIMIT=0`) → `down.sh --clean` | `auto_approved`, `versions.rules` = `sunrise@1` |

**Test mới phải đỏ trước:** test của `evaluateRulesForConfigs`, `configsFor`, `quoteDateProblem` với `order`, `loadRulesConfigSet` viết trước (đỏ vì chưa có); ca 11 với Sunrise đỏ trên code hiện tại (`needs_review`).

**Thay đổi feature map:** mục Rule engine: config theo khách hàng, `dateOrder`, `versions.rules`.

**Những gì sẽ KHÔNG kiểm, và lý do:** staff với khách `MDY` và `DMY` cùng lúc (chưa có khách `DMY`; hành vi đã nêu ở "Khi nào hỏng", có unit test).

# 12g · Guardrail A2: mọi dữ liệu từ ngoài phải qua Zod

Phase: P1 · Trạng thái: Đã duyệt · Ngày: 2026-11-04

## Quyết định đã chốt (Liam, 2026-11-04)

| # | Quyết định |
| --- | --- |
| 1 | Làm sau khi 12f merge và ruleset bật; nhánh từ `main` |
| 2 | Bật `no-unsafe-type-assertion` (trừ test), sửa 3 chỗ bằng Zod; `error-log.int-spec` phải xanh |
| 3 | Không bật `no-unsafe-*` cho `apps/api/test`, `scripts` |
| 4 | Typed lint web/eval/synth để sau. Cấm `JSON.parse` áp ngay, miễn đúng như đề xuất |
| 5 | `parseJson` ném lỗi không kèm input/cause (A14). `@Param("id")` và cookie parse bằng Zod |

## Mục tiêu

Máy chặn được đường đưa dữ liệu chưa kiểm vào code: giá trị `any` không lan được, `JSON.parse` chỉ dùng qua helper có schema. Những cửa lint không thấy được thì ghi rõ, và có test hoặc plan nhận.

## 1. Các cửa dữ liệu vào

Trạng thái: ✅ đã parse Zod · 🟡 có kiểm, chưa bằng Zod · ⏳ chưa có code · 🔴 hở.

| Cửa | Chỗ | Trạng thái | Việc |
| --- | --- | --- | --- |
| HTTP body, query | `@Body`/`@Query` + `ZodValidationPipe` | ✅ | |
| HTTP `@Param` | `staff.controller.ts:28` `@Param("id") id: string` | 🔴 kiểu do TS khai, không kiểm | thêm `ZodValidationPipe(Id)` |
| Cookie | `session-token.ts:22-25` thu hẹp bằng tay, có `as` | 🟡 | đổi sang Zod |
| Multipart field | `upload-parser.ts` → `UploadDocumentFields` | ✅ | |
| Multipart file | magic bytes (`file-type.ts`), giới hạn cỡ | 🟡 đúng cách: dữ liệu nhị phân, không dùng Zod | ghi vào A2 |
| Multipart `filename` | `slice(0, 255)`, thư viện trả `string` | 🟡 chỉ dùng làm tên hiển thị, không dùng làm đường dẫn | giữ |
| HTTP response | `AuthUser.parse`, `StaffProfile.parse`, `UploadDocumentResponse.parse` | ✅ | |
| Env | `envSchema` (Nest config, `seed.ts`, `drizzle.config.ts`) | ✅ | |
| YAML | `loadRulesConfig` → `RulesConfig.parse` | ✅ hàm có, chưa ai gọi lúc khởi động | plan 12 (đã ghi ở 12c) |
| Redis | hiện chỉ `ping`, chưa đọc dữ liệu | ⏳ | **plan 12**, xem mục 4 |
| Job data BullMQ | chưa cài | ⏳ | **plan 12**, xem mục 4 |
| Output LLM | chưa có | ⏳ | plan LLM: `parseJson` + schema `Extraction`/`Classification` |
| DB `jsonb` đọc lên | `$type<>()` chỉ là kiểu TS, không kiểm lúc chạy. Hiện chưa có code đọc các cột kết quả | ⏳ | plan 12 khi bắt đầu đọc; dòng cũ có thể lệch contract mới |
| Golden set, đáp án synth | `eval/src/run.ts`, `tools/synth/src/generate.ts` còn là stub | ⏳ | P2: lint `JSON.parse` đã phủ sẵn |
| Fixture contract | `contracts.test.ts`, `test/contract-fixtures.ts`: `JSON.parse` rồi parse schema | ✅ | miễn lint (mục 3) |
| Web gọi API | `apps/web` chưa có `fetch` | ⏳ | plan web; chưa có typed lint cho web (câu hỏi 3) |

## 2. Năm rule `no-unsafe-*`

Đo trên code hiện tại (chạy qua cờ `--rule`, chưa đổi config):

| Phạm vi | Vi phạm | Chi tiết |
| --- | --- | --- |
| `apps/api/src`, `packages/*/src` | **1** | `all-exceptions.filter.spec.ts:150` member-access `.mock` |
| `apps/api/test`, `apps/api/scripts` (ngoài đề bài) | 32 | 30 argument, 2 assignment. Mẫu: `res.body`, `res.headers` của supertest là `any` |

Con số thấp không phải vì rule không chạy: thử một đoạn `JSON.parse` lấy `.x` trong `packages/rules` thì rule báo đủ.

**Sửa:** chỗ duy nhất là khai báo `logError` trong spec bằng `MockInstance<Logger["error"]>`, thay vì `ReturnType<typeof vi.spyOn>`. Không dùng `eslint-disable`.

Bật trong block typed lint nhưng giới hạn đúng `apps/api/src/**`, `packages/*/src/**`. `apps/api/test` và `scripts` giữ nguyên (câu hỏi 2).

### Điều 5 rule này **không** bắt được (đã thử)

| Đoạn code | 5 rule `no-unsafe-*` | `no-unsafe-type-assertion` |
| --- | --- | --- |
| `JSON.parse(x) as Foo` | lọt | báo |
| `anyBody as Foo` (kiểu `req.body as Foo`) | lọt | báo |
| `job.data.a` với `Job<Foo>` | lọt | **lọt** (kiểu đã khai sai từ đầu) |

Vì vậy đề xuất thêm rule thứ sáu (câu hỏi 1). Trường hợp `Job<Foo>` không lint nào thấy: plan 12 phải nhận test, không dựa vào lint.

## 3. `parseJson` và lint cấm `JSON.parse`

```ts
// packages/contracts/src/parse-json.ts
export function parseJson<S extends z.ZodType>(schema: S, text: string): z.output<S>;
```

- Sai cú pháp → ném `JsonSyntaxError`, **không kèm input và không gắn `cause`**. `SyntaxError` gốc chứa chính dữ liệu, đã chạy thử: `Unexpected token 'S', "{"a":SAMPLE-Jan"... is not valid JSON`. Lọt vào log là phá A14.
- Sai schema → `ZodError` của schema. Test kiểm message không chứa giá trị nhạy cảm.

**Lint:** `MemberExpression[object.name='JSON'][property.name='parse']`, bắt cả `const p = JSON.parse`. Không bắt `const { parse } = JSON`; chấp nhận.

**Cùng bẫy ghi đè `no-restricted-syntax`** như 12a, 12e: thêm hằng `A2_NO_JSON_PARSE`, gộp vào mọi block đang đặt rule này (A5, A3, A14 và 2 miễn trừ của A14), thêm block mới cho nơi chưa có, và file helper chỉ nhận selector A5.

| Nơi | `JSON.parse` | Lý do |
| --- | --- | --- |
| `apps/*`, `packages/*/src`, `eval/src`, `tools/synth/src` | **cấm** | golden set, đáp án synth là I/O theo CLAUDE.md, nên `eval`, `synth` không được miễn dù là công cụ |
| `packages/contracts/src/parse-json.ts` | được | helper |
| `**/*.test.ts`, `**/*.spec.ts`, `apps/api/test/**` | **miễn (đề xuất)** | test cần đưa JSON hỏng vào, và lỗi dữ liệu ở test thì nổ ngay trước mặt |
| `tools/lint/**` (`.mjs`) | **miễn (đề xuất)** | chạy không qua build, không import được contracts; chỉ đọc file trong repo |

Hiện có 4 chỗ `JSON.parse`, đều thuộc nhóm miễn, nên không phải sửa code nào.

## 4. Ghi cho plan 12

**Đã ghi vào STATUS "Tiếp theo":** job data đọc từ Redis phải parse bằng schema trong `packages/contracts`; `Worker<T>`/`Job<T>` chỉ là khai báo kiểu.

## Thay đổi

| File | Thay đổi |
| --- | --- |
| `packages/contracts/src/parse-json.ts` (mới), `index.ts`, `contracts.test.ts` | helper + test. **Vùng kiến trúc**: Liam duyệt ở plan này |
| `eslint.config.mjs` | 5 rule (+ rule 6 nếu duyệt), `A2_NO_JSON_PARSE` |
| `tools/lint/guardrails.test.mjs` | ca vi phạm cố ý cho từng rule; ca miễn trừ |
| `all-exceptions.filter.spec.ts` | sửa kiểu `logError` |
| `staff.controller.ts` | `ZodValidationPipe(Id)` cho `@Param("id")` |
| `session-token.ts`, `pg-error.ts` | chỉ khi duyệt câu hỏi 1: bỏ 3 `as`, dùng Zod |
| `docs/agent/GUARDRAILS.md` | A2, kèm bảng cửa dữ liệu còn ⏳ |
| `docs/STATUS.md` | "Đang học" |

File trong vùng sửa bằng tool Edit (CLAUDE.md), không bằng script.

## Liam tự viết

Mặc định không có, vì plan này không có mục 🎓 mới. Nếu muốn, `parseJson` là chỗ hợp để tự viết: mình viết test trước.

## Contract / config / prompt bị ảnh hưởng

`packages/contracts` thêm export `parseJson`, `JsonSyntaxError`. Không đổi schema có sẵn. Không đổi DB, rule, prompt.

## Tiêu chí xong

- [ ] Mỗi rule mới đỏ trên một vi phạm cố ý, rồi xanh.
- [ ] Không có `eslint-disable` mới.
- [ ] `make lint`, `make typecheck`, `make test`, `make test-int` xanh.
- [ ] GUARDRAILS A2 cập nhật.
- [ ] Evidence report trong PR.

## Rủi ro / câu hỏi

1. **Bật thêm `no-unsafe-type-assertion` không?** Đề xuất **có, cho code thật, miễn test**. Đây là cách duy nhất chặn `req.body as Foo`.
   - Đo được 14 chỗ: 11 ở test (miễn), 3 ở code thật: `session-token.ts:24`, `pg-error.ts:38`, `pg-error.ts:82`.
   - Cách sửa: thay bằng schema Zod cho `cookies` và `cause` của lỗi pg, bản thân cũng là cửa dữ liệu vào.
   - `pg-error.ts` là code A14 vừa làm, `error-log.int-spec.ts` giữ hành vi.
2. **`apps/api/test`, `scripts` có bật 5 rule không?** Đề xuất **không**: đúng phạm vi bạn nêu; 32 vi phạm chủ yếu do `res.body` của supertest, không phải dữ liệu vào production.
3. **Typed lint cho `apps/web`, `eval`, `tools/synth`?** Hiện các nơi này không có typed lint, nên 5 rule không chạy được ở đó. Đề xuất để plan web và P2 làm, lúc đã có code thật. `JSON.parse` thì cấm ngay vì selector không cần type.
4. **`res.json()` của `fetch` cũng trả `any`.** Chưa có `fetch` ở đâu. Đề xuất để plan web, không thêm selector giờ.
5. **Thứ tự với 12f:** 12f chưa commit trên nhánh hiện tại và cũng sửa `GUARDRAILS.md`; `settings.json` trong working tree đang có hiệu lực, nên Edit vào vùng sẽ hỏi. Đề xuất xong 12f trước, rồi tạo nhánh 12g từ `main`.

## Verification plan

**Mức rủi ro:** T2. Đổi lint và có chạm `@Param`, cookie (đường auth). Không đổi dữ liệu, đảo ngược được.

**Hành vi kỳ vọng:**

- Code mới không dùng được `any` hay `JSON.parse` trần ở các nơi đã bật: `make lint` đỏ, message có `A2:`.
- API giữ nguyên hành vi: `/staff/:id` không có → 404, cookie thiếu → 401.
- JSON hỏng không đưa nội dung vào message lỗi.

**Các mức kiểm:**

- [ ] L0: `make lint`, `make typecheck`.
- [ ] L1: `make test`; `node --test tools/lint/*.test.mjs`; test `parseJson`.
- [ ] L2: `make test-int` (`staff`, `auth`, `error-log` vẫn xanh); gọi API đang chạy: `GET /staff/:id` có và không có, `GET /auth/me` không cookie.
- [ ] L2 Eval, L3, L4: không áp dụng.

**Kịch bản** (mỗi ca lint: thêm vi phạm vào file thật → `make lint` → dán dòng lỗi → gỡ → xanh; `packages/contracts/src` sửa bằng Edit nên sẽ có prompt):

| # | Rule | Vi phạm cố ý | Kỳ vọng |
| --- | --- | --- | --- |
| 1 | `no-unsafe-assignment` | `const a = JSON.parse(...)`, dòng khác `any` trong `documents.service.ts` | đỏ |
| 2 | `no-unsafe-member-access` | `anyValue.x` | đỏ |
| 3 | `no-unsafe-call` | `anyValue()` | đỏ |
| 4 | `no-unsafe-return` | hàm trả `anyValue` | đỏ |
| 5 | `no-unsafe-argument` | `f(anyValue)` với tham số `string` | đỏ |
| 6 | `no-unsafe-type-assertion` (nếu duyệt) | `req.body as Foo` | đỏ |
| 7 | `JSON.parse` ở cả 3 block | `apps/api/src`, `packages/rules/src/engine.ts`, `packages/contracts/src/common.ts` | đỏ `A2:`. Engine vẫn đủ selector A3 + A5; kiểm bằng `--print-config` để chắc không bị ghi đè |
| 8 | Miễn trừ | `JSON.parse` trong `*.spec.ts`, `parse-json.ts`, `tools/lint` | không báo |
| 9 | A14 còn nguyên | `.stack` trong `documents.service.ts` | vẫn đỏ `A14:` sau khi gộp selector |
| 10 | Eval, synth | `JSON.parse` trong `eval/src/run.ts` | đỏ `A2:` |

Các ca lint cũng thành test trong `guardrails.test.mjs` để chạy trong `make lint` về sau.

**Test mới phải đỏ trên code cũ:**

- `guardrails.test.mjs` ca A2: chạy trên config chưa có rule → đỏ.
- `parseJson`: viết test trước, chưa có file → đỏ. Tạm rethrow `SyntaxError` gốc → ca "không lộ input" đỏ.
- `@Param`: `GET /staff/:id` không đổi hành vi vì route luôn có `id` không rỗng, nên **test không đỏ được qua HTTP**. Kiểm pipe được gắn bằng spec controller; tạm gỡ pipe → đỏ.

**Thay đổi feature map:** không có.

**Những gì sẽ KHÔNG kiểm, và lý do:**

- Job data, output LLM, DB `jsonb`: chưa có code; đã ghi cho plan 12, plan LLM.
- `const { parse } = JSON` và `globalThis.JSON.parse`: đã biết còn lọt.
- `apps/api/test`, `scripts`, `apps/web`, `eval`, `tools/synth` với 5 rule `no-unsafe-*`: theo câu hỏi 2, 3.

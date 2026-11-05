# 12 · BullMQ: queue, worker process riêng, retry, state machine

Phase: P1 · Trạng thái: Xong, merge PR #24 · Ngày: 2026-11-05

**Lệch so với plan đã duyệt:**

- `bullmq` là 6.6.0, không phải 6.7.0: bản 6.7.0 vướng `minimumReleaseAge` của pnpm, Liam chọn không miễn trừ. `msgpackr-extract: false` trong `pnpm-workspace.yaml`.
- Thêm hạn chờ 2s cho `enqueue`: chạy thật phát hiện upload treo khi Redis chết từ lúc khởi động.
- Processor đổi lỗi thành câu không chứa dữ liệu trước khi ném ra, vì BullMQ lưu message và stack vào Redis (A14).
- Queue dùng lại client `REDIS` của `/ready`, vì cùng option. Thêm log "worker đã dừng" để kiểm được shutdown.
- Tên file: `worker/document-processor.ts`, test enqueue ở `test/documents-enqueue.int-spec.ts`.
- Liam nhờ Claude viết `assertTransition`.

## Bối cảnh

Upload hiện dừng ở `uploaded`: chưa cài `bullmq`, `worker.ts` chỉ log một dòng. Plan này nối upload → job → worker → trạng thái cuối, chưa gọi LLM. Dual-write đầy đủ (sweep) và job idempotent để plan 13.

## Quyết định đã chốt (Liam, 2026-11-05)

| # | Quyết định |
| --- | --- |
| 1 | Tách làm hai: plan 12 (queue, worker, retry, state machine) và plan 13 (sweep, idempotent, test `queue.add` lỗi → sweep cứu) |
| 2 | Processor là stub, chưa gọi LLM. Chốt model là ADR riêng |
| 3 | `versions` ghi stub rõ ràng |
| 4 | Liam tự viết hàm kiểm transition |
| 5 | Hết retry → `needs_review`, theo flows F2. Chỉ lỗi "file hỏng" mới `failed`, không retry. Sửa dòng roadmap, ghi ADR 0006 |

## Phạm vi

- **Trong:**
  - `queue.add` sau khi INSERT thành công, `jobId = documentId`.
  - Worker process riêng, `concurrency: 5`, `attempts: 3`, backoff exponential 1s.
  - Hàm và bảng transition; một nơi duy nhất ghi `status` (A11).
  - Job data parse Zod (A2), `versions` khi vào `processing` (A6).
  - `assertRulesReady` lúc worker khởi động, log bằng `formatErrorForLog`, đóng queue và worker khi shutdown.
- **Ngoài:**
  - Sweep job, upsert kết quả theo `(documentId, step, version)`: plan 13.
  - LLM, rule thật, `timingMs`, A10, A12: plan LLM.
  - Endpoint đọc trạng thái, màn upload: plan sau.
  - Xử lý lại document đã kết thúc (`failed → processing`): chưa có tính năng nào cần.

## Thiết kế

### Hành vi của stub

`pipeline.run()` trả `route([])`, tức `needs_review` với `reasons: ["NO_RULES_EVALUATED"]`. Dùng lại đúng hàm routing có sẵn, nói đúng sự thật là chưa rule nào được chấm, và không có đường tới `auto_approved`.

`versions = { pipeline: "12-stub", prompt: "none", model: "none", rules: String(config.version) }`. Contract cho `z.string()` nên không phải đổi.

### Handler `processDocument(job)`

```
1. ProcessDocumentJob.safeParse(job.data)   sai → UnrecoverableError, log không kèm giá trị
2. đọc status theo documentId               không có dòng → UnrecoverableError
3. uploaded   → transition sang processing, ghi versions
   processing → chạy tiếp (đây là lần retry hoặc job stalled)
   trạng thái khác → log rồi return (đã xử lý xong)
4. chạy pipeline
   thành công               → transition sang kết quả
   UnreadableFileError      → failed + error, rồi UnrecoverableError
   lỗi khác, còn lượt       → rethrow, BullMQ retry
   lỗi khác, lượt cuối      → needs_review + route([]) + error { step: "pipeline", message cố định }
```

- Lượt cuối: `job.attemptsMade + 1 >= job.opts.attempts`. Int test xác nhận bằng số lần pipeline thực sự được gọi, vì docs BullMQ không nói rõ.
- `error.message` là chuỗi cố định, không ghi `err.message` thô (A14).
- `Worker<unknown>`: khai `unknown` thay vì `Worker<Foo>` để compiler bắt buộc parse mới đọc được `job.data`.
- Nhánh `processing` ở bước 3 là bắt buộc cho retry. Phần kiểm tra idempotent đầy đủ để plan 13.

### Bảng transition

| Từ | Sang |
| --- | --- |
| `uploaded` | `processing` |
| `processing` | `extracted`, `needs_review`, `failed` |
| `extracted` | `auto_approved`, `needs_review`, `failed` |
| `needs_review` | `approved`, `rejected`, `reupload_requested` (cả ba bắt buộc `reviewerId`) |
| còn lại | không đi đâu |

A11 chỉ nêu `rejected` bắt buộc `reviewerId`. Plan này mở rộng cho cả ba vì đều là quyết định của người duyệt.

`DocumentStatusService.transition(id, from, to, fields, actor?)` gọi `assertTransition`, rồi `UPDATE ... WHERE id = ? AND status = from`, kèm `updatedAt`. 0 dòng → ném lỗi conflict. Điều kiện `status = from` chặn được race mà kiểm tra trong code không chặn được. Không đổi schema DB.

### Kết nối Redis

| Nơi dùng | Option | Vì sao |
| --- | --- | --- |
| Queue (API) | `enableOfflineQueue: false` | Redis chết thì `add` lỗi ngay, upload không treo |
| Worker | `maxRetriesPerRequest: null` | BullMQ yêu cầu; worker chờ Redis sống lại |

Cả hai gắn listener `error`, log qua `formatErrorForLog`. Client `REDIS` của `/ready` giữ nguyên. Job giữ lại có giới hạn: `removeOnComplete: { count: 1000 }`, `removeOnFail: { count: 5000 }`.

### `queue.add` lỗi

Document đã commit nên vẫn trả 201 `uploaded` và log lỗi. Từ plan này tới plan 13, document đó sẽ nằm ở `uploaded` cho tới khi có sweep. Upload trùng không enqueue lại.

### Cách ly test

`testEnv.REDIS_URL` đổi sang `redis://localhost:6379/1`. Nếu dùng chung db 0, worker dev đang chạy sẽ ăn mất job của test. Mỗi int-spec dọn queue bằng `obliterate`.

## Liam tự viết

**`assertTransition(from, to, actor?)` và bảng transition** trong `apps/api/src/documents/state-machine.ts`. Hàm thuần, ném `InvalidTransitionError`.

Claude viết `state-machine.spec.ts` trước (đỏ vì chưa có code), gợi ý khi bị kẹt, review sau khi viết. Phần còn lại Claude code rồi giải thích ngắn.

**Thay đổi (Liam, 2026-11-05):** Liam nhờ Claude viết luôn hàm này. Liam đọc lại và tự trả lời câu "Tự kiểm" rồi mới tick trong `progress.md`.

## Thay đổi

| File | Thay đổi | Vùng kiến trúc |
| --- | --- | --- |
| `apps/api/package.json`, `pnpm-lock.yaml` | thêm `bullmq` (bản mới nhất 6.7.0; peer `ioredis >=5`, repo đang `^6`) | ✔ package.json |
| `packages/contracts/src/jobs.ts` (mới), `index.ts`, `contracts.test.ts` | `ProcessDocumentJob { documentId: Id }` | ✔ |
| `eslint.config.mjs`, `tools/lint/guardrails.test.mjs` | `A11_NO_STATUS_WRITE`, gộp vào mọi block `no-restricted-syntax` của `apps/api/src`, miễn file writer | ✔ |
| `apps/api/src/documents/state-machine.ts`, `.spec.ts` (mới) | Liam viết hàm; Claude viết spec | |
| `apps/api/src/documents/document-status.service.ts`, `document-status.module.ts` (mới) | nơi duy nhất ghi `status` | |
| `apps/api/src/queue/document-queue.ts`, `queue.module.ts` (mới) | token `DOCUMENT_QUEUE`, `enqueue(documentId)`, job options, đóng khi destroy | |
| `apps/api/src/documents/documents.service.ts`, `documents.module.ts` | enqueue sau INSERT | |
| `apps/api/src/pipeline/pipeline.ts` (mới) | interface, stub, `UnreadableFileError`, hằng versions | |
| `apps/api/src/worker/process-document.ts`, `document-worker.service.ts` (mới) | handler; vòng đời `Worker` | |
| `apps/api/src/rules/rules-config.provider.ts` (mới) | `loadRulesConfig` + `assertRulesReady`, sai thì không khởi động | |
| `apps/api/src/worker.ts`, `worker.module.ts` | nối module, `enableShutdownHooks` | |
| `apps/api/src/config/env.schema.ts`, `.env.example` | `RULES_CONFIG_PATH`, mặc định `../../config/rules/default.yaml` (cwd là `apps/api`) | |
| `apps/api/test/test-env.ts`, `test/worker.int-spec.ts` (mới), `documents.int-spec.ts` | Redis db 1, test mới | |
| `docs/decisions/0006-*.md`, `docs/roadmap.md` | hết retry → `needs_review` | |
| `docs/agent/GUARDRAILS.md`, `.claude/skills/verify/FEATURE_MAP.md` | A2 job data, A6, A11; luồng pipeline | ✔ |
| `docs/STATUS.md`, `docs/learning/progress.md`, `docs/learning/notes/p1-bullmq.md` | trạng thái, `code:`, `note:` (Liam tự tick) | |

File trong vùng kiến trúc chỉ sửa bằng Edit/Write để Liam thấy prompt duyệt. `pnpm add` sẽ ghi `package.json` bằng lệnh, nên plan sửa `package.json` bằng Edit trước, rồi chạy `pnpm install`.

## Contract / config / prompt bị ảnh hưởng

- **Contract:** thêm `ProcessDocumentJob`, không đổi schema có sẵn.
- **Không đổi:** DB, rule, prompt, model.
- **Env:** thêm `RULES_CONFIG_PATH`.

## Tiêu chí xong

- [ ] Upload mới → document tự đi tới `needs_review`, `versions` đủ 4 trường, không cần thao tác tay.
- [ ] Pipeline lỗi tạm: được gọi đúng 3 lần, rồi `needs_review` có `error`, không kẹt ở `processing`.
- [ ] `queue.add` lỗi: vẫn 201, dòng DB còn nguyên.
- [ ] Rule config sai: worker không khởi động.
- [ ] `make lint`, `make typecheck`, `make test`, `make test-int` xanh.
- [ ] Evidence report (skill `verify`) có trong PR.

## Rủi ro / câu hỏi

1. **Job stalled hết lượt, hoặc DB chết đúng lượt cuối:** handler không chạy được nên document kẹt ở `processing`. Roadmap chỉ giao sweep cho `uploaded`. Ghi vào STATUS để **plan 13 sweep cả `processing` quá hạn**, vì tiêu chí P1 là "không document nào kẹt ở `processing`".
2. **Job còn giữ lại chặn `add` trùng `jobId`:** docs chỉ nói job đã xoá thì dùng lại được id, chưa nói rõ về job completed/failed còn giữ. Plan 13 phải thử thật trước khi dựa vào.
3. **Lint A11 có lỗ:** `const patch = { status }; db.update().set(patch)` lọt. Selector chỉ bắt object viết trực tiếp, nên A11 ghi 🟡.
4. **`UnreadableFileError` chưa có nơi ném thật:** stub không đọc file. Nhánh này chỉ kiểm bằng pipeline giả cho tới plan LLM.
5. **Dòng stub trong DB dev** mang `model: "none"`: chỉ là dữ liệu giả lập, không cần migrate.
6. **Docs:** Context7 chưa đăng nhập nên mình đọc docs.bullmq.io trực tiếp. Điều docs không nói rõ thì test thật, như mục 1 và 2.

## Verification plan

**Mức rủi ro:** T2. Đổi đường upload và thêm nơi ghi `status`, nhưng không có đường tới `auto_approved`, không đổi DB, rule, prompt, đảo ngược được.

**Hành vi kỳ vọng:**

- Staff upload giấy → 201 ngay, sau đó document tự sang `needs_review`, lý do `NO_RULES_EVALUATED`.
- Lỗi tạm được thử lại, hết lượt thì chuyển cho người, không kẹt và không tự từ chối.
- Redis chết: upload vẫn nhận file, không treo.
- Worker từ chối khởi động khi bộ rule sai.

**Các mức kiểm:**

- [ ] L0: `make lint`, `make typecheck`.
- [ ] L1: `make test` (`state-machine.spec`, `ProcessDocumentJob`), `node --test tools/lint/*.test.mjs`.
- [ ] L2: `make test-int` (Postgres và Redis thật, `Worker` BullMQ thật, pipeline giả khi cần); gọi API đang chạy + worker process thật.
- [ ] L2 Eval, L3, L4: không áp dụng (chưa có LLM, chưa có UI).

**Kịch bản:**

| # | Kịch bản | Cách chạy | Kết quả quan sát được |
| --- | --- | --- | --- |
| 1 | Luồng chuẩn, process thật | `make dev-api`, `make dev-worker`, login `staff@example.test`, `POST /documents` file SAMPLE, đọc dòng bằng `psql` | 201 `uploaded`; sau đó `needs_review`, `routing.reasons = ["NO_RULES_EVALUATED"]`, `versions` đủ |
| 2 | Upload trùng | gửi lại file ở #1 | `duplicate: true`, không có job mới |
| 3 | Lỗi tạm rồi hồi phục | int-spec: pipeline giả lỗi 2 lần | gọi 3 lần, kết quả thành công, `error` rỗng |
| 4 | Hết retry | int-spec: pipeline giả luôn lỗi | gọi đúng 3 lần, `needs_review`, `error.step = "pipeline"`, message không chứa nội dung lỗi gốc |
| 5 | File hỏng | int-spec: giả ném `UnreadableFileError` | gọi 1 lần, `failed` có `error` |
| 6 | Job data sai | int-spec: `add` thẳng `{ documentId: 123 }` | job ở failed set, không retry, log không chứa giá trị |
| 7 | `queue.add` lỗi | int-spec: đè `DOCUMENT_QUEUE` bằng bản ném lỗi | 201, dòng `uploaded` còn, log có lỗi |
| 8 | Redis chết thật | `docker compose stop redis`, upload, rồi `start redis` | 201 nhanh, `/ready` 503; đo thời gian phản hồi |
| 9 | Job chạy lại trên document đã xong | int-spec: thêm job khác `jobId` cho document đã `needs_review` | pipeline không chạy, dòng không đổi |
| 10 | Rule config sai | `RULES_CONFIG_PATH=<file hỏng> make dev-worker` | process thoát, lỗi nêu rõ, không nhận job |
| 11 | Shutdown | gửi `SIGTERM` cho worker | thoát sạch, không treo |
| 12 | A11 | lint: `.set({ status })` trong file khác | đỏ `A11:`; file writer không báo |
| 13 | A14 còn nguyên | lint: `.stack` trong `documents.service.ts` sau khi gộp selector | vẫn đỏ `A14:` |
| 14 | Transition sai | spec: `uploaded → auto_approved`, `needs_review → rejected` không có `reviewerId` | ném `InvalidTransitionError` |
| 15 | CAS | int-spec: `transition` với `from` đã lỗi thời | lỗi conflict, dòng không đổi |

**Test mới phải đỏ trên code cũ:**

- `state-machine.spec`: đỏ vì chưa có file, trước khi Liam viết.
- `worker.int-spec` #4: tạm bỏ nhánh lượt cuối → document kẹt `processing`, test đỏ.
- `documents.int-spec` enqueue: tạm bỏ dòng `enqueue` → đỏ. #7: tạm bỏ `try/catch` → 500, đỏ.
- `guardrails.test.mjs` A11: chạy trên config chưa có selector → đỏ.
- #6: tạm bỏ `safeParse` → đỏ.

**Thay đổi feature map:** cập nhật mục "Pipeline xử lý" (trạng thái thật của stub, cách chạy worker), bỏ `TODO(verify)` plan 12 và dòng "Worker chưa có job nào". Thêm lý do hết retry.

**Những gì sẽ KHÔNG kiểm, và lý do:**

- Sweep cứu document, chạy cùng job 2 lần không trùng dữ liệu: plan 13.
- Job stalled khi worker bị kill giữa chừng: ghi ở rủi ro 1, plan 13.
- Tải cao, `concurrency` chạy song song thật: L4 không áp dụng, stub không có việc nặng.
- LLM, rule thật, `timingMs`: chưa có code.

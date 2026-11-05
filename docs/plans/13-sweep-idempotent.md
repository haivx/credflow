# 13 · Sweep job và job idempotent

Phase: P1 · Trạng thái: Đã duyệt · Ngày: 2026-11-05

## Mục tiêu

Không document nào kẹt mãi ở `uploaded` hoặc `processing`, kể cả khi `queue.add` lỗi, Redis mất dữ liệu, DB chết đúng lượt cuối hoặc job stalled hết lượt. Chạy trùng job không làm sai dữ liệu.

Đóng 2 tiêu chí P1: "giả lập `queue.add` lỗi thì sweep vẫn đưa document đi xử lý" và "chạy cùng một job 2 lần không sinh dữ liệu trùng". Tiêu chí "LLM lỗi 50% không kẹt `processing`" kiểm ở plan LLM.

## Quyết định đã chốt (Liam, 2026-11-05)

| # | Quyết định |
| --- | --- |
| 1 | `processing` quá hạn, không còn job sống → `needs_review` kèm `error`, không chạy lại |
| 2 | Bỏ "upsert theo `(documentId, step, version)`" khỏi roadmap: không thêm bảng, dựa vào CAS của `transition` + test |

## Kết quả thử thật (BullMQ 6.6.0, Redis thật, 2026-11-05)

| Thử | Kết quả |
| --- | --- |
| Job `failed` còn giữ + `add` cùng `jobId` | Không báo lỗi, job không chạy lại |
| Job `completed` còn giữ + `add` cùng `jobId` | Không báo lỗi, job không chạy lại |
| `queue.remove` rồi `add` | Chạy lại đúng 1 lần |
| `queue.remove` job đang `active` | Trả 0, job vẫn chạy |
| `getJobState` job không tồn tại | `unknown` |

Vậy sweep chỉ gọi `add` thôi là không đủ: phải xoá job đã kết thúc trước.

## Phạm vi

- **Trong:** sweep định kỳ; xử lý `DocumentStatusConflictError` trong processor; test chạy trùng; ADR 0007; sửa roadmap, FEATURE_MAP.
- **Ngoài:** LLM thật; index cho query sweep (đổi schema, dữ liệu MVP còn nhỏ); chạy lại document đã có kết quả; endpoint đọc trạng thái.

## Thiết kế

### Mỗi vòng sweep

Lịch: 60 giây một lần. Query lấy tối đa 100 document cũ nhất theo `updatedAt`, ở 2 trạng thái đã quá hạn:

| Trạng thái | Quá hạn sau | Job `waiting`/`active`/`delayed`/`prioritized` | Job `completed`/`failed` | Job `unknown` |
| --- | --- | --- | --- | --- |
| `uploaded` | 1 phút | bỏ qua | xoá rồi `add` lại | `add` lại |
| `processing` | 15 phút | bỏ qua | `needs_review` | `needs_review` |

- Sang `needs_review` qua `DocumentStatusService.transition`, với `routing: route([])`, `ruleResults: []`, `error: { step: "sweep", message: "Xử lý bị gián đoạn" }`. `error.step` là `z.string()` nên contract không đổi. Message cố định (A14).
- CAS của `transition` lo trường hợp worker vừa xong cùng lúc: conflict thì coi như không có việc gì.
- Lỗi ở một document: log rồi xử lý document kế tiếp.
- Log chỉ có `documentId` và trạng thái, qua `formatErrorForLog`. Processor sweep đổi lỗi thành câu không chứa dữ liệu trước khi ném, giống `DocumentProcessor.process`, vì BullMQ lưu stack vào Redis.

### Lịch chạy

- Queue riêng `document-sweep`, `Worker` riêng `concurrency: 1`, dùng `queue.upsertJobScheduler` (có trong type của bản 6.6.0 đang cài). Không dùng chung queue `documents` để job sweep không đi qua parse `ProcessDocumentJob`.
- Giữ lại ít job: `removeOnComplete: { count: 10 }`, `removeOnFail: { count: 50 }`.
- **Đăng ký lại mỗi khi kết nối Redis `ready`, không chỉ lúc khởi động.** Redis chạy `--appendonly no` nên restart có thể mất cả lịch. Nếu chỉ đăng ký lúc khởi động, sweep sẽ im lặng dừng đúng lúc cần nhất. Lỗi khi đăng ký thì log, không làm crash worker.

### Processor

Trong `document-processor.ts`, `DocumentStatusConflictError` ở bước ghi kết quả nghĩa là process khác đã xong. Xử lý mới: log `warn` rồi `return`, không retry, không vào nhánh lượt cuối. Hiện tại lỗi này đi vào retry, tốn lượt và ghi log lỗi sai bản chất.

### Tổ chức code

- `BullDocumentQueue` thêm `hasLiveJob(id)` và `requeue(id)`. Interface `DocumentQueue` của API giữ nguyên chỉ có `enqueue`, nên stub trong test không phải sửa.
- `WorkerModule` import `QueueModule` để dùng lại client `REDIS` (không có offline queue: Redis chết thì sweep lỗi ngay).
- `sweepOnce(now)` public để test gọi trực tiếp, không phải chờ lịch.

## Thay đổi

| File | Thay đổi |
| --- | --- |
| `apps/api/src/worker/document-sweep.service.ts` (mới) | query, bảng quyết định, `sweepOnce(now)`, hằng số ngưỡng |
| `apps/api/src/queue/queue.module.ts`, `document-queue.ts` | `hasLiveJob`, `requeue`, tên queue sweep, export `BullDocumentQueue` |
| `apps/api/src/worker/document-worker.service.ts` | thêm `Worker` sweep, đăng ký lịch khi `ready`, đóng khi shutdown |
| `apps/api/src/worker/document-processor.ts` | xử lý conflict |
| `apps/api/src/worker.module.ts` | import `QueueModule`, thêm provider sweep |
| `apps/api/test/sweep.int-spec.ts` (mới), `worker.int-spec.ts` | test sweep, test chạy trùng |
| `docs/decisions/0007-sweep-processing-sang-nguoi-duyet.md` (mới) | 2 quyết định trên |
| `docs/roadmap.md` | bỏ upsert, ghi hành vi sweep cho `processing` |
| `.claude/skills/verify/FEATURE_MAP.md` | hành vi sweep, bỏ dòng "Chưa có sweep" |
| `apps/api/src/documents/documents.service.ts` | không đổi code; comment "plan 13" vẫn đúng nên giữ |
| `docs/STATUS.md`, `docs/plans/13-sweep-idempotent.md` | trạng thái, plan |

## Vùng kiến trúc bị chạm

`.claude/skills/verify/FEATURE_MAP.md` (chỉ sửa bằng Edit). Không có file nào khác.

## Contract / config / prompt bị ảnh hưởng

Không đổi contract, schema DB, rule, prompt, model, env. Ngưỡng và lịch là hằng số trong code, không phải ngưỡng của rule.

## Quyết định đáng nhớ

- **Chỗ khó nhất:** `jobId = documentId` chặn `add` trùng nhưng cũng chặn luôn sweep, và không báo lỗi. Đã thử thật: phải xoá job đã kết thúc trước.
- **Đã loại `jobId` mới cho mỗi lần sweep:** mất đảm bảo "mỗi document một job", và phải tìm job theo tiền tố.
- **Đã loại `setInterval`:** sống sót khi mất Redis, nhưng roadmap chọn repeatable job. Đăng ký lại khi `ready` xử lý được cùng rủi ro.
- **Đã loại chạy lại `processing`:** Liam chọn `needs_review` để không lặp vô hạn và không tốn thêm LLM (ADR 0007).
- **Khi nào hỏng:** mất Redis khiến ca `processing` đang chạy đi thẳng sang người duyệt dù chạy lại có thể được. Document `uploaded` mà job luôn lỗi trước bước vào `processing` sẽ được đẩy lại mỗi phút (không gọi LLM, chỉ tốn log). Nhiều worker thì sweep chạy song song vẫn an toàn nhờ `jobId` + CAS, nhưng có thể có xung đột giữa `remove` và `add`. Muốn chặt hơn thì dùng outbox (đã có trong "Học nâng cao").

## Tiêu chí xong

- [ ] `queue.add` lỗi lúc upload → sweep đưa document tới `needs_review`.
- [ ] Job `failed` còn giữ không chặn được sweep cứu document `uploaded`.
- [ ] `processing` quá hạn, không còn job sống → `needs_review` có `error`, pipeline không chạy.
- [ ] Job còn sống, hoặc document chưa quá hạn → sweep không đụng tới.
- [ ] Hai job cùng document chạy song song → một kết quả, job thua không lỗi.
- [ ] Lịch sweep tự có lại sau khi Redis mất dữ liệu và restart.
- [ ] `make lint`, `make typecheck`, `make test`, `make test-int` xanh.
- [ ] Evidence report (skill `verify`) có trong PR, kết quả ✅ hoặc phần chưa kiểm đã được Liam chấp nhận.

## Rủi ro / câu hỏi

1. **`ready` của ioredis lúc reconnect:** mình đang dựa vào việc sự kiện này bắn lại khi kết nối lại. Kịch bản 11 kiểm thật. Nếu sai, dừng lại báo Liam.
2. **Stalled thật:** stub chạy quá nhanh nên khó bắt đúng lúc để kill worker. Xem mục "không kiểm".
3. **Docs:** Context7 chưa đăng nhập. Mình dựa vào type của package đã cài và thử thật, không dựa vào trí nhớ.

## Verification plan

**Mức rủi ro:** T2. Thêm một nơi tự đổi trạng thái sang `needs_review`, nhưng không có đường tới `auto_approved` hay từ chối, không đổi DB, contract, đảo ngược được.

**Hành vi kỳ vọng:**

- Redis chết lúc upload: giấy vẫn được nhận, Redis sống lại thì trong khoảng 2 phút giấy tự được xử lý.
- Xử lý bị gián đoạn hẳn: giấy chuyển cho người duyệt, không kẹt, không tự từ chối, không tự duyệt.
- Chạy trùng không làm sai dữ liệu.

**Các mức kiểm:**

- [ ] L0: `make lint`, `make typecheck`.
- [ ] L1: `make test`.
- [ ] L2: `make test-int` (Postgres, Redis, BullMQ thật, pipeline giả khi cần); chạy API + worker process thật.
- [ ] L2 Eval, L3, L4: không áp dụng (chưa có LLM, UI).

**Kịch bản:**

| # | Kịch bản | Cách chạy | Kết quả quan sát được |
| --- | --- | --- | --- |
| 1 | `queue.add` lỗi rồi sweep cứu | int-spec: upload với `DOCUMENT_QUEUE` lỗi, chỉnh `updatedAt` cũ, `sweepOnce` | có job, cuối cùng `needs_review`, pipeline chạy 1 lần |
| 2 | Job `failed` còn giữ | int-spec: job failed thật, document `uploaded` quá hạn | xoá job cũ, chạy lại, `needs_review` |
| 3 | Job `completed` còn giữ | int-spec tương tự | chạy lại, `needs_review` |
| 4 | `processing` quá hạn, không có job | int-spec | `needs_review`, `error.step = "sweep"`, `reasons = ["NO_RULES_EVALUATED"]`, pipeline không chạy |
| 5 | `processing` quá hạn, job `failed` | int-spec | như #4 |
| 6 | `processing` quá hạn, job `active` | int-spec: pipeline giả giữ job | dòng không đổi, xong job thì ra kết quả của pipeline |
| 7 | Chưa quá hạn, và trạng thái đã xong | int-spec | dòng không đổi, không có job mới |
| 8 | Hai job song song cùng document | int-spec: 2 `jobId`, pipeline giả giữ cả hai rồi thả | một lần ghi kết quả, cả hai job `completed`, không có log error |
| 9 | Một document lỗi giữa vòng | int-spec: `requeue` lỗi với document đầu | document sau vẫn được xử lý, log không chứa giá trị |
| 10 | Redis chết thật, process thật | `make dev-api`, `make dev-worker`; `docker compose stop redis`; upload; `docker compose start redis`; đọc bằng `psql` | 201 `uploaded`; sau khoảng 2 phút `needs_review`; log worker có dòng sweep đẩy lại |
| 11 | Mất lịch khi Redis mất dữ liệu | worker đang chạy; `redis-cli FLUSHALL`; `docker compose restart redis`; đọc scheduler bằng `redis-cli` | lịch có lại không cần restart worker; document `uploaded` mới vẫn được cứu |
| 12 | Shutdown | `SIGTERM` worker | thoát sạch, có log "worker đã dừng" |

Kịch bản 11 dùng `FLUSHALL` trên Redis dev, chỉ mất job dev. Kịch bản 10, 11 chạy trên DB dev với giấy SAMPLE.

**Test mới phải đỏ trên code cũ:**

- #2, #3: tạm bỏ bước xoá job trong `requeue` → document vẫn `uploaded`, đỏ.
- #4, #5: tạm bỏ nhánh `processing` → document vẫn `processing`, đỏ.
- #6: tạm bỏ kiểm `hasLiveJob` → dòng bị đổi, đỏ.
- #8: chạy trên processor cũ → job thua lỗi/retry, có log error, đỏ.
- #9: tạm bỏ `try/catch` theo từng document → đỏ.

**Thay đổi feature map:** mục "Pipeline xử lý": bỏ "Chưa có sweep", thêm bảng hành vi sweep và cách kiểm; thêm `test/sweep.int-spec.ts`.

**Những gì sẽ KHÔNG kiểm, và lý do:**

- `kill -9` worker giữa job để tạo stalled thật: stub xong ngay. Kết quả cuối của stalled hết lượt là job `failed`, đã phủ ở #5. Sẽ kiểm ở plan LLM khi pipeline có thời gian chạy thật.
- LLM lỗi 50%: chưa có LLM.
- Nhiều worker process chạy sweep cùng lúc: MVP chạy một worker.
- Tải cao, hơn 100 document kẹt: chỉ phủ giới hạn batch ở mức đọc code.

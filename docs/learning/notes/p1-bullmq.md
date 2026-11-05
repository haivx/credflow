# P1 · BullMQ, retry, state machine (plan 12)

## Queue và worker

- API chỉ đẩy job (`apps/api/src/queue/queue.module.ts`); worker là process riêng (`apps/api/src/worker.ts`). LLM chậm hoặc crash không kéo HTTP theo, và hai bên scale riêng được.
- `concurrency: 5`: một process chạy tối đa 5 job cùng lúc. Node vẫn một luồng, nên chỉ có lợi với việc chờ I/O như gọi LLM.
- Hai kiểu kết nối Redis: phía đẩy job phải lỗi nhanh (`enableOfflineQueue: false`), phía worker phải chờ được (`maxRetriesPerRequest: null`).

## Retry

- `attempts: 3` tính cả lần đầu. Backoff exponential `delay: 1000`: chờ 1s, rồi 2s.
- Ném lỗi thường → BullMQ thử lại. Ném `UnrecoverableError` → vào failed set ngay.
- BullMQ lưu message và stack của lỗi vào Redis. Vì vậy processor đổi lỗi thành câu không chứa dữ liệu trước khi ném ra (A14).

## Dữ liệu job là dữ liệu từ ngoài

`Job<Foo>` chỉ là khai báo, không kiểm gì lúc chạy, nên lint không thấy. Dự án khai `Job<unknown>`: compiler buộc phải parse mới đọc được. `req.body as Foo` thì khác, nó có phép ép kiểu `as` để rule `no-unsafe-type-assertion` bắt.

## State machine: hai lớp

| Lớp | Chặn gì | Không chặn được |
| --- | --- | --- |
| `assertTransition` (`documents/state-machine.ts`) | bước đi sai logic, thiếu `reviewerId` | giá trị `from` đã cũ |
| `UPDATE ... WHERE status = from` (`documents/document-status.service.ts`) | hai process đua nhau | bước đi sai logic |

CHECK ở DB chặn dòng có dữ liệu vô lý, nhưng không biết trạng thái trước đó là gì.

## Bẫy đã gặp khi chạy thật

Redis chết **từ lúc API khởi động**: `queue.add` chờ kết nối mãi, `enableOfflineQueue: false` không giúp vì BullMQ đang đợi client sẵn sàng. Upload treo. Sửa bằng `Promise.race` với hạn 2 giây. Redis chết **giữa chừng** thì lỗi ngay, không gặp bẫy này.

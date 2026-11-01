# Learning progress

> Mục tiêu: middle–intermediate Node.js. Danh sách lấy từ các mục 🎓 trong `docs/roadmap.md`.
> **Chỉ bạn tick** `[x]`, khi trả lời được câu "Tự kiểm" mà không nhìn code. Claude điền `code:` và `note:` khi làm xong.
> Cách dùng: `docs/learning/README.md`.

## P0 · Nền tảng

- [ ] **Module, controller, provider, DI trong Nest** · code: `apps/api/src/{app.module,main,worker,worker.module}.ts`, `apps/api/src/health/`, `apps/api/src/app-info/` · note: `notes/p0-nest-di.md`
  - Tự kiểm: Nest biết inject gì vào constructor của một service bằng cách nào? Vì sao `tsx` không chạy được DI của Nest?
- [ ] **Custom provider (token `DB` cho Drizzle)** · code: — · note: —
  - Tự kiểm: Khi nào cần `useFactory` + `@Inject(TOKEN)` thay vì để Nest tự inject theo class?
- [ ] **Vòng đời request trong Nest** · code: — · note: —
  - Tự kiểm: Kể thứ tự middleware, guard, pipe, interceptor, filter. Kiểm quyền đặt ở đâu, validate body đặt ở đâu?
- [ ] **Config từ env validate bằng Zod** · code: — · note: —
  - Tự kiểm: Vì sao nên để app không khởi động được khi thiếu biến env, thay vì lỗi lúc chạy?
- [ ] **Drizzle schema và migration** · code: — · note: —
  - Tự kiểm: Sửa schema xong thì sinh và chạy migration thế nào? Vì sao không sửa thẳng DB bằng tay?
- [ ] **Ràng buộc ở DB (FK, NOT NULL, CHECK, unique)** · code: — · note: —
  - Tự kiểm: Code đã validate rồi thì vì sao vẫn cần ràng buộc ở DB?
- [ ] **Zod validation pipe** · code: — · note: —
  - Tự kiểm: Vì sao dự án dùng Zod pipe mà không dùng class-validator?
- [ ] **Exception filter và format lỗi thống nhất** · code: — · note: —
  - Tự kiểm: Một lỗi Zod và một lỗi unique violation từ Postgres đi qua filter thì client nhận được gì?
- [ ] **`/health` và `/ready`** · code: — · note: —
  - Tự kiểm: Redis chết thì `/health` và `/ready` trả gì? Hệ thống deploy dùng mỗi endpoint vào việc gì?
- [ ] **Integration test với Postgres thật (supertest)** · code: — · note: —
  - Tự kiểm: Mock DB thì bỏ sót loại lỗi nào mà test với DB thật bắt được? Làm sao để các test không dính dữ liệu của nhau?

## P1 · Lát cắt CPR

- [ ] **Stream khi upload và tính sha256** · code: — · note: —
  - Tự kiểm: Upload file 50 MB mà đọc cả file vào `Buffer` thì có vấn đề gì? Tính hash trong lúc stream thế nào?
- [ ] **Interface storage (local / S3)** · code: — · note: —
  - Tự kiểm: Muốn đổi từ local sang S3 thì phải sửa những file nào?
- [ ] **Dedupe upload bằng unique index** · code: — · note: —
  - Tự kiểm: Hai request upload cùng một file đến cùng lúc thì chuyện gì xảy ra, và code xử lý lỗi unique thế nào?
- [ ] **BullMQ: queue, worker process riêng, concurrency** · code: — · note: —
  - Tự kiểm: Vì sao worker chạy process riêng thay vì chạy chung với HTTP? `concurrency: 5` nghĩa là gì?
- [ ] **Retry, backoff, job lỗi** · code: — · note: —
  - Tự kiểm: `attempts: 3` với backoff exponential thì job chạy lại lúc nào? Hết lượt thì job đi đâu?
- [ ] **Dual-write và sweep job** · code: — · note: —
  - Tự kiểm: Vì sao không gói ghi DB và `queue.add` trong một transaction được? `queue.add` lỗi sau khi commit thì document được xử lý lại bằng cách nào? Cách này có giới hạn gì?
- [ ] **Job idempotent** · code: — · note: —
  - Tự kiểm: Cùng một job chạy 2 lần thì vì sao không sinh dữ liệu trùng? Vì sao `jobId` thôi chưa đủ?
- [ ] **State machine của document** · code: — · note: —
  - Tự kiểm: Chặn transition sai ở code và ở DB khác nhau thế nào? Vì sao cần cả hai?
- [ ] **Gọi LLM: timeout, phân loại lỗi** · code: — · note: —
  - Tự kiểm: Lỗi nào nên retry, lỗi nào không? `AbortController` dùng để làm gì?
- [ ] **Parse output LLM bằng Zod** · code: — · note: —
  - Tự kiểm: Output LLM sai schema thì hệ thống làm gì, theo thứ tự nào?

## P2 · Eval

- [ ] **CLI script bằng Node** · code: — · note: —
  - Tự kiểm: Script lỗi giữa chừng thì exit code nên là gì, vì sao CI cần điều đó?
- [ ] **Giới hạn concurrency (`p-limit`)** · code: — · note: —
  - Tự kiểm: `Promise.all` trên 200 lời gọi LLM có vấn đề gì? `p-limit(5)` khác gì?
- [ ] **Random có seed** · code: — · note: —
  - Tự kiểm: Vì sao `Math.random()` không dùng được khi cần sinh lại đúng cùng dữ liệu?
- [ ] **Cache kết quả LLM theo hash** · code: — · note: —
  - Tự kiểm: Cache key gồm những gì? Đổi prompt mà quên đưa version vào key thì sai thế nào?
- [ ] **Chạy tiếp sau khi bị ngắt** · code: — · note: —
  - Tự kiểm: Lưu gì và lưu lúc nào để Ctrl+C rồi chạy lại không phải làm lại từ đầu?

## P3 · Rule engine

- [ ] **Hàm thuần và truyền `asOf`** · code: — · note: —
  - Tự kiểm: Vì sao rule engine không gọi `Date.now()`? Viết test cho `EXPIRING_SOON` thế nào?
- [ ] **Ngày `YYYY-MM-DD` và ca biên** · code: — · note: —
  - Tự kiểm: `new Date('2026-03-01')` có thể lệch ngày ở múi giờ nào? 31/01 + 1 tháng là ngày nào?
- [ ] **Validate config YAML khi khởi động** · code: — · note: —
  - Tự kiểm: Config sai thì app báo lỗi lúc nào, và lỗi trông ra sao?
- [ ] **Query JOIN / GROUP BY, index, `EXPLAIN`** · code: — · note: —
  - Tự kiểm: Đọc output `EXPLAIN` thế nào để biết query dùng index? Index nào giúp query "đủ bộ giấy"?
- [ ] **Ranh giới package bằng ESLint** · code: — · note: —
  - Tự kiểm: Lỡ import `@nestjs/common` trong `packages/rules` thì chuyện gì xảy ra?

## P4 · Hàng chờ

- [ ] **Transaction nhiều bảng, truyền `tx`** · code: — · note: —
  - Tự kiểm: Lỗi sau khi update `documents` nhưng trước khi insert `review_actions` thì dữ liệu ra sao?
- [ ] **Optimistic locking** · code: — · note: —
  - Tự kiểm: Hai reviewer bấm duyệt cùng lúc thì ai thắng, người kia thấy gì? Vì sao `version` chặn được?
- [ ] **Keyset pagination** · code: — · note: —
  - Tự kiểm: Offset pagination bị gì khi có ca mới vào hàng chờ giữa lúc đang lật trang?
- [ ] **Bảng chỉ insert** · code: — · note: —
  - Tự kiểm: Vì sao `review_actions` không cho update? Chặn ở code thì còn lỗ hổng gì?
- [ ] **Stream file có kiểm quyền** · code: — · note: —
  - Tự kiểm: Vì sao không cho web đọc thẳng thư mục upload?

## P5 · Đủ 5 loại giấy

- [ ] **Log có cấu trúc (pino)** · code: — · note: —
  - Tự kiểm: `console.log` khác log JSON có `requestId` ở chỗ nào khi debug production? Những trường nào không được log?
- [ ] **Nối log API và worker** · code: — · note: —
  - Tự kiểm: Từ một `documentId`, tìm được log của cả hai process bằng cách nào?
- [ ] **Đo thời gian, p95 bằng SQL** · code: — · note: —
  - Tự kiểm: Vì sao nhìn p95 chứ không chỉ nhìn trung bình?
- [ ] **Mở rộng cho loại giấy mới** · code: — · note: —
  - Tự kiểm: Thêm loại giấy thứ 6 thì phải sửa những chỗ nào?

## P6 · Deploy

- [ ] **Secrets và env khi deploy** · code: — · note: —
  - Tự kiểm: API key LLM nằm ở đâu lúc chạy production? Lộ key thì làm gì?
- [ ] **Dockerfile multi-stage** · code: — · note: —
  - Tự kiểm: Vì sao image production không nên có devDependencies?
- [ ] **Migration khi deploy** · code: — · note: —
  - Tự kiểm: Chạy migration trước hay sau khi app mới nhận traffic, vì sao?
- [ ] **Graceful shutdown** · code: — · note: —
  - Tự kiểm: Nhận `SIGTERM` lúc worker đang xử lý job thì chuyện gì nên xảy ra?
- [ ] **Rate limit (`@nestjs/throttler`)** · code: — · note: —
  - Tự kiểm: Demo công khai không có rate limit thì rủi ro gì? Limit theo IP có điểm yếu gì?

## Học nâng cao

Thêm dòng khi gặp trong lúc làm. Danh sách gốc ở cuối `docs/roadmap.md`.

- [ ] **Đọc hiểu project Nest CommonJS (`require`, `bootstrap()`, Jest)** · gặp ở: plan 03, khi so ESM với CommonJS · note: —
  - Tự kiểm: Trong project CommonJS, vì sao `main.ts` phải bọc trong `bootstrap()` và gọi kèm `.catch`? Import file của mình có cần đuôi `.js` không?

# `/health`, `/ready` và integration test với Postgres thật

Phase: P0 · Code: `apps/api/src/health/`, `apps/api/src/redis/`, `apps/api/test/`, `apps/api/vitest.int.config.ts`, `docker-compose.yml` (`db-test`) · Plan: `docs/plans/06-ready-integration-test.md`

## `/health` khác `/ready`

| | `/health` (liveness) | `/ready` (readiness) |
| --- | --- | --- |
| Hỏi | Process còn sống không? | Nhận request được không? |
| Kiểm | Không gì (chạy tới handler là 200) | Postgres `SELECT 1`, Redis `PING` |
| Fail thì hệ thống deploy | **Restart** process | **Ngừng gửi traffic**, không restart |

`/health` không được gọi DB: Postgres chết 30s mà `/health` fail thì mọi instance API bị restart, không giúp gì. `/ready` fail thì instance chỉ bị rút khỏi load balancer, DB sống lại là tự nhận traffic.

Body `/ready` chỉ có `"up"`/`"down"`; lỗi gốc (host, cổng) đi ra **log**, không ra response. Hai đường riêng: response cho client, log cho người vận hành.

## Client Redis "fail nhanh"

ioredis mặc định **cố chờ** Redis sống lại: offline queue giữ lệnh khi chưa kết nối, `maxRetriesPerRequest: 20`, reconnect mãi. Redis chết thì `ping()` treo (thử thật: vẫn treo sau 5s; `quit()` cũng treo).

```ts
new Redis(url, {
  enableOfflineQueue: false, // chưa kết nối → lệnh lỗi ngay
  maxRetriesPerRequest: 1,   // lệnh đang chạy lúc đứt: lỗi sau 1 lần reconnect
  connectTimeout: 1000,      // mở TCP treo (host không trả lời) → bỏ sau 1s
});
```

- Giữ `retryStrategy` mặc định: Redis sống lại thì client tự nối lại, `/ready` về 200 không cần restart.
- BullMQ (P1) cần **ngược lại** (`maxRetriesPerRequest: null`, chờ mãi để không mất job) → connection riêng.
- Hệ quả: lệnh gửi **trước** event `ready` cũng lỗi ngay. Trong test phải chờ `redis.status === "ready"` (kiểm `status` trước, vì `once("ready")` không bắn lại nếu đã ready).

## Timeout cho mọi lời gọi ra ngoài

```ts
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
```

- `Promise.race`: lấy kết quả promise xong **trước**. Là lưới an toàn cho kiểu hỏng mình chưa nghĩ tới (pool `pg` hết connection, Redis kẹt mà socket chưa đóng).
- `race` **không huỷ** promise thua, chỉ thôi chờ. Muốn huỷ thật (HTTP, LLM ở P1) dùng `AbortController`.
- Thiếu `clearTimeout` → mỗi lần gọi để lại một timer sống thêm `ms`.
- `Promise.allSettled` thay `Promise.all`: `all` reject ở lỗi đầu tiên, mất kết quả của bên kia; `allSettled` cho `{ status: "fulfilled" | "rejected" }` từng cái → biết chính xác service nào `down`.
- Log lỗi kèm **tên** service: message timeout của DB và Redis giống hệt nhau.

## Service không biết HTTP

`ReadyService.check()` trả `{ status, checks }`; `ReadyController` mới đổi `status: "error"` thành `503` (`throw new ServiceUnavailableException(result)`, object truyền vào thành body). Worker hay CLI gọi lại `check()` được, ở đó không có 503.

Module Nest là singleton: `StaffModule` và `HealthModule` cùng import `DbModule` → cùng một pool (trừ dynamic module `forRoot()` khác tham số, hoặc scope `REQUEST`).

## Unit test với đồ giả và fake timers

- Đồ giả chỉ cần đúng hàm service gọi: `{ execute: () => Promise.resolve() }`, `{ ping: () => Promise.reject(...) }`.
- Token phải **đúng giá trị**: `REDIS` là `Symbol("REDIS")`, chuỗi `"REDIS"` là token khác → Nest không tìm thấy provider.
- Promise không bao giờ xong: `new Promise(() => {})`.
- Fake timers: `vi.useFakeTimers()` **trước** khi tạo timer → gọi `check()` **không await**, giữ promise → `await vi.advanceTimersByTimeAsync(1000)` → `await promise`. `await check()` ngay thì test đứng chờ một timer chỉ chạy khi mình tua.
- `afterEach(() => vi.useRealTimers())` nằm trong `describe`, không nằm trong `it`.
- Phá code thử (đổi timeout 1000 → 2000) để thấy test fail: test chưa từng fail thì chưa chứng minh gì. Test không có `expect` thì luôn pass.

## Integration test

| | Unit (`make test`) | Integration (`make test-int`) |
| --- | --- | --- |
| DB, Redis | Đồ giả | Thật: `credflow_test` (5433, tmpfs), Redis |
| Dựng | Một service | Cả `AppModule` |
| Gọi | `service.check()` | HTTP qua supertest |
| Bắt thêm | | SQL sai, migration thiếu, module quên import, JSON sai format |

- `app.init()` (không mở cổng) + `request(app.getHttpServer())`. `app.close()` ở `afterAll`: chạy `onApplicationShutdown` đóng pool và Redis; thiếu thì vitest không thoát.
- Env test (`test/test-env.ts`) đi qua `env` của vitest; biến của process **thắng** `.env` trong `ConfigModule`.
- `global-setup.ts` chạy migration một lần và **từ chối** DB không tên `credflow_test` (test có `TRUNCATE`).
- `beforeEach`: `TRUNCATE` rồi insert đúng dữ liệu test cần → không phụ thuộc lần chạy trước, không đụng DB dev.
- Insert **ngược** thứ tự mong đợi (Zara trước Avery) → test chỉ pass khi `orderBy` thật sự chạy.
- `overrideProvider(TOKEN).useFactory(...)` chỉ có tác dụng **trước** `.compile()`. App đã compile thì không đổi provider → cấu hình khác cần app khác. Mỗi cấu hình một `describe` con với `beforeAll`/`afterAll` riêng: đối xứng, không cần `try/finally`.
- Khác `useValue` giả ở unit test: dùng client ioredis **thật** với option thật, chỉ đổi cổng → kiểm được hành vi thật của thư viện (lỗi nhanh, `quit()` không treo).
- `elapsed < 1000ms`: chứng minh 503 đến từ đường lỗi nhanh, không phải timeout. Để option `{}` trong test thì `ping()` và `quit()` treo → test timeout 5s, che mất lỗi `expect` thật.

## Lỗi hay gặp

- `Promise.all` cho health check → không biết service nào chết.
- Quên `clearTimeout`; `await` promise trước khi tua fake timers.
- Copy mẫu test mà giữ thiết lập thừa (`TRUNCATE staff` trong test `/ready`).
- Test dùng option khác app → kiểm sai đường code.
- Drizzle bọc lỗi: message chỉ là `Failed query: select 1`, nguyên nhân thật ở `error.cause`.

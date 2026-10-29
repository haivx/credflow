# 0001 · Stack: monorepo TypeScript, Next.js + NestJS + Postgres + BullMQ/Redis

Ngày: 2026-10-29 (thay bản 2026-10-27: Hono + pg-boss) · Trạng thái: **Chấp nhận** · Người quyết: Liam

## Bối cảnh

CredFlow là dự án vừa build vừa học. Mục tiêu cá nhân: lên mức **middle–intermediate Node.js developer**, có một sản phẩm hoàn chỉnh để đưa vào hồ sơ. Làm một mình cùng Claude Code, không có hạn chót.

Khối lượng job thực tế nhỏ (vài trăm document trong demo). **Về tải, Hono + pg-boss là đủ**, và bản ADR trước chọn đúng như vậy. Bản này đổi stack vì một lý do khác: mục tiêu học.

## Quyết định

1. **Một ngôn ngữ: TypeScript** cho web, API, worker, rule engine, eval và bộ sinh dữ liệu.
2. **pnpm workspace:** `apps/web`, `apps/api`, `packages/contracts`, `packages/rules`, `eval`, `tools/synth`.
3. **Web:** Next.js 14 App Router, Tailwind + shadcn/ui, TanStack Query.
4. **API: NestJS trên Node.**
5. **Job queue: BullMQ + Redis 7.**
6. **Postgres 16 + Drizzle ORM.** Postgres là nguồn sự thật cho mọi trạng thái nghiệp vụ.
7. **Zod 4** trong `packages/contracts` là nguồn sự thật cho kiểu dữ liệu.
8. **Rule engine là package riêng, hàm thuần.**

## Lý do thật

- **NestJS:** thường gặp trong công việc Node backend. Muốn học cách tổ chức một codebase lớn hơn: module, DI, vòng đời request (guard, pipe, filter), test với DI. Hono gọn hơn nhưng không dạy được phần cấu trúc này.
- **BullMQ:** muốn **tự gặp vấn đề dual-write**. pg-boss nằm trong cùng Postgres, nên ghi document và tạo job gói được trong một transaction, và vấn đề biến mất. Với BullMQ, job nằm ở Redis, không cùng transaction với Postgres, nên phải tự xử lý trường hợp ghi được DB nhưng đẩy job lỗi. BullMQ cũng dạy retry, backoff, concurrency và repeatable job, những thứ hay gặp khi làm việc.
- **Không** chọn vì tải hay vì "phổ biến". Reviewer hỏi thì trả lời thẳng: đây là quyết định học.

## Hệ quả

- **Thêm một nơi lưu trạng thái: Redis.**
  - BullMQ yêu cầu `maxmemory-policy noeviction`. Redis tự xoá key khi đầy là mất job.
  - **Chấp nhận mất dữ liệu Redis** (không bật AOF), vì Postgres là nguồn sự thật: document chưa xử lý xong vẫn có trạng thái trong DB, và sweep job (bên dưới) đẩy lại job. Mất Redis chỉ làm chậm, không làm mất document.
- **Dual-write không còn atomic.** Cách xử lý ở mức hiện tại:
  1. Commit `documents` với trạng thái `uploaded`.
  2. Sau commit mới gọi `queue.add('process', …, { jobId: documentId })`. Dùng cùng `jobId` để không tạo trùng job khi job cũ còn trong Redis.
  3. **Sweep job** (BullMQ repeatable, mỗi phút): tìm document ở `uploaded` quá N phút rồi đẩy lại.
  4. **Worker idempotent:** kiểm trạng thái trước khi chạy, ghi kết quả bằng upsert. `jobId` không chặn trùng tuyệt đối (job đã bị xoá khỏi Redis thì `add` lại vẫn tạo job mới), nên tầng chặn cuối cùng là worker.
  - Giới hạn: document có thể trễ tối đa N phút nếu `queue.add` lỗi. Cách chặt hơn là transactional outbox + relay, xếp ở "Học nâng cao" trong roadmap.
- **`GET /ready` kiểm cả Postgres lẫn Redis.**
- **Dev:** docker compose có thêm Redis. **Deploy:** cần một Redis managed cấu hình được `noeviction`. Nơi deploy chốt ở P6.
- **Tooling:** DI của Nest cần `emitDecoratorMetadata`. `tsx` và esbuild không hỗ trợ, nên `apps/api` build và chạy dev bằng SWC (Nest CLI), test bằng Vitest + `unplugin-swc`.

## Ràng buộc NestJS

1. **Một codebase, hai entrypoint:** `src/main.ts` (HTTP) và `src/worker.ts` (BullMQ processor, không mở cổng HTTP). Hai process deploy và scale riêng. Module chứa processor chỉ được import ở `worker.ts`.
2. **Drizzle:** inject qua custom provider (token `DB`). Transaction truyền **tường minh**: hàm nào cần thì nhận tham số `tx`, kiểu chung cho cả `db` lẫn `tx`. Chưa dùng AsyncLocalStorage hay `nestjs-cls` (xếp ở "Học nâng cao").
3. **Validate bằng Zod:** request, response, env đều qua Zod pipe dùng schema trong `packages/contracts`. **Không dùng class-validator / class-transformer**, để không có hai nguồn sự thật về kiểu dữ liệu.
4. **`packages/rules` và `packages/contracts` không phụ thuộc Nest:** không decorator, không DI, không import `@nestjs/*`. API gọi rule engine như một hàm bình thường. Kiểm bằng ESLint `no-restricted-imports`.
5. **Lỗi:** một exception filter toàn cục trả về một format `{ code, message, details? }`.

## Phương án đã cân nhắc

- **Hono + pg-boss (bản trước):** gọn, ít dịch vụ, đủ tải, enqueue gói được trong transaction. Bỏ vì không phục vụ mục tiêu học ở trên. Nếu sau này chỉ cần vận hành rẻ thì đây vẫn là lựa chọn tốt.
- **Fastify:** nhẹ và nhanh, nhưng tự ghép cấu trúc, cùng vấn đề như Hono.
- **NestJS + pg-boss:** học được Nest nhưng không gặp dual-write.
- **Supabase:** nhanh ở auth/storage nhưng che phần backend cần học; có thể dùng làm Postgres khi deploy.

## Thay đổi so với bản trước

- Hono → NestJS; pg-boss → BullMQ + Redis.
- Thêm cách xử lý dual-write, ràng buộc NestJS và hệ quả về Redis.
- Đổi bất kỳ mục nào ở trên → sửa ADR này hoặc thêm ADR mới.

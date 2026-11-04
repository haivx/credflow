# P1 · Upload: stream, sha256, storage, dedupe

Plan 11, ADR 0005. Code: `apps/api/src/documents/`, `apps/api/src/storage/`, `apps/api/test/documents.int-spec.ts`.

## Luồng

```
POST /documents (multipart: file + declaredDocType?)
  → AuthGuard → RolesGuard(staff)
  → parseUpload(req): req.pipe(busboy)
       file stream ──► hashToTempFile ──► DATA_DIR/tmp/<uuid>   (sha256 + đếm byte theo từng chunk)
  → DocumentsService.createFromUpload
       validate field (Zod) → file rỗng? 400 → 8 byte đầu: PDF/PNG/JPEG? không thì 415
       → SELECT theo checksum: cùng staff → 200 duplicate; staff khác → 409
       → rename tmp → DATA_DIR/files/documents/<id>.<ext> → INSERT
            23505 (request song song thắng trước) → xoá file vừa ghi → SELECT lại → nhánh trùng
       finally: rm file tạm (nếu còn)
```

## 1. Vì sao stream, không đọc cả file vào memory

- **Đọc cả file vào `Buffer`** (multer memory storage, `await req.arrayBuffer()`): memory = kích thước file × số upload đồng thời. 10 MB × 50 request là 500 MB. Tệ hơn, kẻ xấu gửi file 2 GB là process chết vì hết RAM, trước cả khi code kịp kiểm tra giới hạn.
- **Stream:** dữ liệu đi qua từng chunk (thường 16–64 KB), xử lý xong chunk này mới nhận chunk kế. Memory không phụ thuộc kích thước file.
- **Backpressure:** đĩa ghi chậm hơn mạng thì sao? `writable.write()` trả `false` khi buffer đầy, phía đọc phải dừng cho tới khi có `'drain'`. Tự làm bằng `.on('data')` rất dễ quên bước này: `data` cứ đổ vào, memory lại phình. `stream.pipeline` lo việc này.

## 2. `stream.pipeline` và tính hash trong lúc stream

- `pipeline(source, transform, destination)` (bản promise ở `node:stream/promises`):
  - Nối các stream với nhau, có backpressure.
  - **Một chỗ lỗi thì destroy tất cả** rồi reject.
  - Còn `a.pipe(b)` thì không chuyền lỗi: source lỗi mà destination vẫn mở, file descriptor bị rò.
- **Bước ở giữa** có thể là `Transform` stream hoặc async generator `async function* (chunks) { for await (const c of chunks) { ...; yield c } }`.
- **Hash tăng dần:** `createHash("sha256")` cho phép `update(chunk)` nhiều lần, cuối cùng mới gọi `digest("hex")` một lần. Kết quả giống hệt hash cả file một lúc (spec có test cho điều này).
- **Giới hạn dung lượng:** đếm byte trong lúc stream, vượt thì throw. Throw ở bước giữa → pipeline destroy source và file đang ghi → không đọc tiếp nữa. Spec dùng một source vô hạn để kiểm điều này.
- **Dọn khi lỗi:** destroy write stream không xoá file đã ghi một phần. Phải tự `rm` trong `catch` rồi mới throw lại.

## 3. busboy và các bẫy của nó

- **busboy parse multipart dạng stream:**
  - Mỗi file là một event `file` kèm một `Readable`.
  - Field text đến qua event `field`.
  - Thứ tự field và file đúng như client gửi.
- **Quá `limits.fileSize` thì busboy không báo lỗi:** nó cắt file rồi đặt `truncated = true`. Không kiểm tra cờ này thì sẽ lưu một file bị cắt cụt mà không ai biết. Ở đây busboy được đặt `MAX + 1` để `hashToTempFile` luôn thấy vượt.
- **Phải đọc hết mọi file stream**, kể cả file không cần (`stream.resume()`). Không đọc thì busboy đứng chờ và request treo.
- **File stream bị destroy giữa chừng thì busboy không bao giờ phát `close`.** Đọc source `lib/types/multipart.js` thì thấy busboy chờ `_read` hoặc `'end'` của file stream. Vì thế `parseUpload` reject ngay khi file lỗi, không chờ busboy.
- **Đọc hết body khi trả lỗi sớm:** server trả 413 rồi đóng kết nối khi client còn đang gửi thì client thấy `EPIPE` thay vì đọc được response. `req.unpipe(bb); req.resume()` đọc tiếp rồi bỏ phần còn lại.
- **Client ngắt kết nối:** `req` phát `close` với `req.complete === false`. Lúc đó destroy file stream để `hashToTempFile` reject và tự dọn file tạm.

## 4. Storage qua interface, `rename` là atomic

- **Service chỉ biết interface `Storage`** (`putFromTemp`, `remove`) qua token `STORAGE`, giống cách inject `DB`. Đổi sang S3 thì viết `S3Storage` và đổi provider trong `storage.module.ts`; service không sửa gì.
- **File tạm và file thật nằm cùng ổ đĩa** (`DATA_DIR/tmp`, `DATA_DIR/files`), nên `rename` là atomic. File ở vị trí cuối luôn là file đã ghi xong, không có trạng thái "đang ghi dở".
- **`storageKey` do server sinh** (`documents/<ulid>.<ext>`). Tên file người dùng chỉ để hiển thị. Dùng tên người dùng làm path thì `../../etc/passwd` là path traversal. `LocalStorage.pathOf` vẫn kiểm thêm một lớp.

## 5. Dedupe: SELECT trước chưa đủ, unique index mới chốt được

- **SELECT theo checksum** xử lý ca thường gặp: nộp lại file cũ.
- **Hai request cùng file đến cùng lúc:** cả hai SELECT đều không thấy gì, rồi cả hai INSERT. Đây là race kiểu *check-then-act*. Chỉ unique index ở DB chặn được, vì Postgres kiểm tra unique ngay khi INSERT.
- **Bên thua nhận lỗi `23505`:** xoá file vừa ghi, SELECT lại dòng của bên thắng, rồi trả kết quả như ca trùng. Test `Promise.all` hai request cho ra `[200, 201]` với cùng `documentId`.
- **Vì sao "ghi file trước, INSERT sau":** sai một bước thì file mồ côi vô hại hơn dòng DB trỏ tới file không tồn tại. Đây là bản nhỏ của bài dual-write ở plan BullMQ.

## 6. Không tin client

- **Loại file:** đọc 8 byte đầu (magic bytes: `%PDF-`, `89 50 4E 47…`, `FF D8 FF`), không tin `Content-Type` hay đuôi file.
- **`staffId`:** lấy từ session. Form gửi `staffId` thì bị `strictObject` từ chối (400).
- **Tên file:** chỉ để hiển thị, cắt còn tối đa 255 ký tự, không bao giờ dùng làm path.

## Lỗi hay gặp

- **Dùng `.pipe()` thay vì `pipeline`:** lỗi không được chuyền, stream không đóng, file descriptor bị rò.
- **Gọi `hash.digest()` hai lần**, hoặc gọi trước khi stream xong. Hash rỗng hoặc sai, hoặc throw `Digest already called`.
- **Quên xoá file tạm ở mọi nhánh lỗi.** Ở đây dùng `finally { rm(tmp, { force: true }) }` trong service: nhánh thành công đã `rename` đi rồi nên `rm` không làm gì.
- **Kiểm `file.truncated` của busboy sau khi đã lưu file**, thay vì kiểm trong lúc stream.
- **Integration test đọc lại file bằng đường dẫn tương đối:** test chạy ở thư mục khác thì sai. Test dùng `DATA_DIR` tuyệt đối trong thư mục tạm của hệ điều hành.

## Chưa làm (ghi ở "Học nâng cao" trong roadmap)

- Dedupe theo `(staff_id, checksum)` để 409 không lộ thông tin giữa các staff.
- Upload thẳng lên S3 bằng presigned URL; job dọn file mồ côi.
- Header `Idempotency-Key`.

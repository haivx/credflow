# 0005 · Upload: busboy stream, sha256, dedupe toàn cục, ghi file trước INSERT sau

Ngày: 2026-11-03 · Trạng thái: Chấp nhận · Người quyết: Liam

## Bối cảnh

P1 cần `POST /documents` để staff nộp giấy (PDF/ảnh). File có thể tới 10 MB, và cùng một file có thể bị nộp lại nhiều lần: bấm hai lần, mạng chập chờn rồi thử lại, hoặc nộp lại sau vài ngày. Bảng `documents` đã có `checksum` unique (plan 07). Plan 11 chọn cách nhận file và cách xử lý trùng.

## Quyết định

1. **Dùng `busboy` trực tiếp, không dùng multer / `FileInterceptor`.** File đi thẳng từ request qua `stream.pipeline` xuống file tạm. sha256 và số byte được tính theo từng chunk, không bao giờ giữ cả file trong memory.
2. **Giới hạn 10 MB** (`UPLOAD_MAX_BYTES`), quá thì 413 `PAYLOAD_TOO_LARGE`. Chỉ có một chỗ quyết định "quá lớn": `hashToTempFile`. busboy được đặt `fileSize = MAX + 1` chỉ để chặn đọc vô hạn.
3. **Loại file nhận theo magic bytes** (PDF, PNG, JPEG), không tin `Content-Type` hay đuôi file client gửi. Sai loại thì 415 `UNSUPPORTED_MEDIA_TYPE`. Cột `mime_type` lưu loại đã nhận dạng.
4. **Checksum unique toàn cục.**
   - Cùng staff nộp lại cùng file → 200, trả `documentId` cũ, `duplicate: true`.
   - Checksum đã thuộc staff khác → 409.
   - Hai request cùng file chạy song song: unique index là chốt chặn cuối. Bên thua nhận lỗi 23505, đọc lại dòng đã có rồi xử lý như ca trùng.
5. **Ghi file trước, INSERT sau.**
   - Thứ tự: file tạm → `rename` vào `DATA_DIR/files/documents/<id>.<ext>` → INSERT.
   - INSERT lỗi thì xoá file vừa ghi. Process chết giữa hai bước thì để lại một file mồ côi, chấp nhận.
6. **`staffId` lấy từ session** (ADR 0004), không nhận từ form. Chỉ vai trò `staff` được upload.
7. **Storage qua interface** `Storage { tmpDir, putFromTemp, remove }`, MVP dùng `LocalStorage`.

## Lý do

- **Stream thay vì buffer:**
  - 10 MB × vài chục upload cùng lúc là vài trăm MB RAM.
  - Buffer cả file còn mở đường cho tấn công gửi file lớn làm hết memory.
  - Stream thì memory chỉ cỡ vài chunk 64 KB, không phụ thuộc kích thước file.
- **busboy thay vì multer:** multer cũng dùng busboy bên dưới. Ẩn nó đi thì mất đúng phần cần học: stream, backpressure, dọn file khi lỗi. Muốn tính hash trong lúc stream thì vẫn phải viết storage engine riêng cho multer.
- **Magic bytes:** đổi đuôi `.txt` thành `.pdf` thì trình duyệt vẫn gửi `application/pdf`. Pipeline phía sau (tiền xử lý, LLM) cần đúng loại file thật.
- **Unique index thay vì chỉ SELECT trước:** giữa SELECT và INSERT, một request khác có thể chen vào. Chỉ ràng buộc ở DB mới chặn được race này.
- **Ghi file trước:** sai một bước thì file mồ côi vô hại hơn dòng DB trỏ tới file không tồn tại, vì job xử lý sẽ lỗi khi mở file. Đây là bản nhỏ của bài dual-write (DB + queue) ở plan BullMQ.
- **Dedupe toàn cục:** một file giấy tờ thuộc đúng một người. Hai staff nộp cùng một file gần như chắc chắn là nộp nhầm hoặc gian lận, nên trả 409 để người nộp biết.

## Phương án đã cân nhắc

- **multer + `FileInterceptor` (memory hoặc disk storage).** Ít code hơn, nhưng memory storage giữ cả file trong RAM; disk storage thì phải đọc lại file để hash. Không chọn.
- **Dedupe theo `(staff_id, checksum)`.** Không lộ thông tin giữa các staff, nhưng hai người nộp cùng file sẽ tạo hai document. Phải đổi schema DB. Ghi ở "Học nâng cao".
- **INSERT trước rồi ghi file.** DB có thể trỏ tới file không tồn tại. Không chọn.
- **Upload thẳng lên S3 bằng presigned URL.** Đúng cho production, nhưng phải có S3 và bước xác nhận sau khi upload. Để sau.

## Hệ quả

- **Contract:**
  - `ErrorCode` thêm `PAYLOAD_TOO_LARGE`, `UNSUPPORTED_MEDIA_TYPE`.
  - Thêm `UploadDocumentFields`, `UploadDocumentResponse`.
- **Rò rỉ thông tin:** 409 cho staff B biết "file này đã có người nộp". Chấp nhận được với dữ liệu giả lập; sản phẩm thật nên dedupe theo staff.
- **File mồ côi** (process chết giữa rename và INSERT) chưa có job dọn.
- **Client ngắt kết nối giữa chừng:** file tạm được xoá.
- **Request lỗi** (413…): API vẫn đọc hết body còn lại để client nhận được response lỗi, thay vì `EPIPE`.
- **Chưa đẩy job:** plan BullMQ thêm `queue.add` sau INSERT, kèm sweep job cho document kẹt ở `uploaded`.

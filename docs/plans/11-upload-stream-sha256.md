# 11 · Upload giấy: stream, sha256, dedupe

Phase: P1 · Trạng thái: Xong · Ngày: 2026-11-03

## Mục tiêu

Staff đã đăng nhập gửi được một file PDF/PNG/JPEG lên `POST /documents`. API stream file xuống đĩa, vừa ghi vừa tính sha256, và không đọc cả file vào memory. Sau đó API tạo `DocumentRecord {status: uploaded}`. Upload lại cùng file thì nhận lại `documentId` cũ, không tạo dòng mới. Chưa đẩy job: phần đó thuộc plan BullMQ.

## Quyết định đã chốt (Liam, 2026-11-03)

| # | Quyết định | Lý do |
| --- | --- | --- |
| 1 | Checksum unique toàn cục (giữ `documents_checksum_unique`). Cùng staff upload lại → trả document cũ; checksum đã thuộc staff khác → 409 | Không đổi schema. Một file giấy tờ thuộc đúng một người |
| 2 | Dùng `busboy` trực tiếp, không dùng multer / `FileInterceptor` | Thấy rõ stream, multer giấu mất phần cần học |
| 3 | Giới hạn 10 MB (`UPLOAD_MAX_BYTES`) | Ảnh chụp và PDF scan một trang thường dưới 10 MB |
| 4 | `staffId` lấy từ user đăng nhập (ADR 0004), không nhận từ form | Không ai nộp hộ người khác được |
| 5 | Thêm `PAYLOAD_TOO_LARGE`, `UNSUPPORTED_MEDIA_TYPE` vào `ErrorCode` (câu 1 phương án a) | Web báo lỗi riêng cho từng ca |
| 6 | Chấp nhận 409 làm lộ "file đã có người nộp", ghi "Học nâng cao" | Dữ liệu giả lập |
| 7 | Viết ADR 0005 | Ghi lại các quyết định upload |

## Phạm vi

- **Trong:**
  - `POST /documents` (multipart), chỉ cho vai trò `staff`.
  - Hàm stream → temp file + sha256 + giới hạn dung lượng.
  - Nhận dạng loại file bằng magic bytes.
  - Interface `Storage` + `LocalStorage` dưới `DATA_DIR`.
  - Dedupe theo checksum, kể cả khi 2 request cùng file chạy song song.
  - Env `UPLOAD_MAX_BYTES`.
  - Test, note học.
- **Ngoài:**
  - Đẩy job / BullMQ (plan sau).
  - `GET /documents` (danh sách giấy của tôi).
  - Tải file về.
  - Màn upload web và màn login (plan web).
  - S3.
  - Dọn file mồ côi định kỳ.
  - Quét virus.
  - Upload nhiều file một lần.

## Luồng `POST /documents`

```
AuthGuard → RolesGuard(staff) → controller lấy @Req() thô
  └─ busboy(headers, limits: files 1, fields 2, fileSize = MAX + 1)
       ├─ field "declaredDocType" (tuỳ chọn) → gom lại, validate bằng Zod khi busboy xong
       └─ file "file" → hashToTempFile(stream, {tmpDir, maxBytes})   ← Liam viết
            → { sha256, sizeBytes, tmpPath }
  ├─ sizeBytes = 0                  → xoá temp, 400
  ├─ detectFileType(8 byte đầu)     → không phải PDF/PNG/JPEG → xoá temp, 415
  ├─ SELECT theo checksum
  │    ├─ cùng staff  → xoá temp, 200 {documentId cũ, duplicate: true}
  │    └─ staff khác  → xoá temp, 409 CONFLICT
  └─ chưa có → id = ulid() → storage.putFromTemp(tmpPath, key) (rename) → INSERT
       ├─ OK                       → 201 {documentId, duplicate: false}
       └─ 23505 (request song song thắng trước) → storage.remove(key) → SELECT lại → nhánh trùng ở trên
```

- **Đặt `fileSize = MAX + 1`:** busboy không báo lỗi khi file vượt giới hạn, nó chỉ cắt file và đặt `truncated = true`. Cho busboy cắt ở `MAX + 1` byte thì `hashToTempFile` vẫn thấy vượt và throw. Vậy chỉ có một chỗ quyết định "quá lớn", và file không bao giờ bị cắt mà không ai biết.
- **Thứ tự "ghi file rồi mới INSERT":** nếu INSERT lỗi thì chỉ còn lại một file mồ côi, vô hại và dọn sau được. Làm ngược lại (INSERT trước) thì DB có thể trỏ tới file không tồn tại. Đây là bản nhỏ của bài dual-write ở plan BullMQ.
- **`storageKey = documents/<id>.<ext>`:** `ext` lấy từ loại file thật, không lấy từ tên file người dùng gửi, nên không có path traversal. `fileName` gốc chỉ lưu để hiển thị, cắt còn tối đa 255 ký tự.
- **Không tin `mimeType` client gửi:** cột `mime_type` lưu kết quả `detectFileType`.

## 🎓 Liam tự viết

`apps/api/src/documents/hash-to-temp-file.ts`:

```ts
export class FileTooLargeError extends Error {}  // Claude viết sẵn

/**
 * Stream `source` vào một file mới trong `tmpDir`, vừa ghi vừa tính sha256 và đếm byte.
 * Vượt `maxBytes` → throw FileTooLargeError. Lỗi bất kỳ → xoá temp file rồi mới throw.
 */
export async function hashToTempFile(
  source: Readable,
  opts: { tmpDir: string; maxBytes: number },
): Promise<{ sha256: string; sizeBytes: number; tmpPath: string }>;
```

Khái niệm: `stream.pipeline` (từ `node:stream/promises`), `Transform` hoặc async generator ở giữa, `createHash("sha256").update()` theo từng chunk, backpressure, dọn file khi lỗi.

Claude viết `hash-to-temp-file.spec.ts` trước (test đỏ). Các case:
- sha256 và `sizeBytes` đúng cho nội dung đã biết; file temp có đúng nội dung đó.
- File đúng bằng `maxBytes` thì qua; `maxBytes + 1` thì `FileTooLargeError` và không còn file trong `tmpDir`.
- Source phát lỗi giữa chừng (client ngắt kết nối) → reject, không còn file.
- Stream rỗng → `sizeBytes: 0`. Hàm không chặn trường hợp này; service chặn.
- Nhiều chunk nhỏ cho cùng hash với một chunk lớn.

Gợi ý theo bậc khi Liam bị kẹt, đáp án đưa sau cùng.

## Thay đổi

| File / module | Thay đổi |
| --- | --- |
| `apps/api/src/documents/hash-to-temp-file.ts` (+ spec) | **Liam viết.** Claude viết spec + `FileTooLargeError` |
| `apps/api/src/documents/file-type.ts` (+ spec) | `detectFileType(head: Buffer): "application/pdf" \| "image/png" \| "image/jpeg" \| null` theo magic bytes (`%PDF-`, `89 50 4E 47 0D 0A 1A 0A`, `FF D8 FF`) |
| `apps/api/src/storage/storage.ts` | Interface `Storage { putFromTemp(tmpPath, key); remove(key) }` + token `STORAGE` |
| `apps/api/src/storage/local-storage.ts` (+ spec) | Ghi dưới `DATA_DIR/files/`, temp ở `DATA_DIR/tmp/` (cùng ổ đĩa nên `rename` là atomic); `mkdir -p` lúc khởi động |
| `apps/api/src/storage/storage.module.ts` | Provider `STORAGE` → `LocalStorage` |
| `apps/api/src/documents/upload-parser.ts` | Bọc busboy thành `Promise<{ fields, file: {sha256, sizeBytes, tmpPath, fileName} }>`: không có file / quá 1 file / sai tên field / không phải multipart → 400; dọn temp nếu lỗi sau khi đã ghi |
| `apps/api/src/documents/documents.service.ts` | Luồng dedupe + INSERT + bắt 23505 như sơ đồ trên |
| `apps/api/src/documents/documents.controller.ts` | `@Roles("staff")`, `POST /documents`, `@CurrentUser()`, trả 201 hoặc 200 |
| `apps/api/src/documents/documents.module.ts`, `app.module.ts` | Đăng ký module |
| `apps/api/src/common/all-exceptions.filter.ts` (+ spec) | Map 413, 415 (theo câu 1 bên dưới) |
| `apps/api/src/config/env.schema.ts` (+ spec), `.env.example` | `UPLOAD_MAX_BYTES` mặc định `10485760` |
| `apps/api/package.json` | `busboy`, dev `@types/busboy` |
| `apps/api/test/documents.int-spec.ts` (mới), `test/upload.ts` (helper) | Integration test bên dưới. `DATA_DIR` trỏ vào thư mục tạm riêng của mỗi lần chạy |
| `docs/flows.md` F1 | Ghi rõ 10 MB, dedupe, 409 |
| `docs/learning/notes/p1-stream-upload.md` (mới), `progress.md` | Note + điền `code:`/`note:` (không tick) |
| `README.md` | Ví dụ `curl -F file=@...` |

## Contract bị ảnh hưởng (cần Liam duyệt)

`UploadDocumentFields` ở `packages/contracts/src/document.ts`; `UploadDocumentResponse` ở `routing.ts` (cạnh `DocumentStatus`, đặt ở `document.ts` thì import vòng):

```ts
/** Field text đi kèm file trong multipart POST /documents. */
export const UploadDocumentFields = z
  .strictObject({ declaredDocType: DocType.optional() })
  .meta({ id: "UploadDocumentFields" });

/** Response POST /documents. 201 = tạo mới, 200 = file này staff đã nộp rồi (duplicate: true). */
export const UploadDocumentResponse = z
  .object({ documentId: Id, status: DocumentStatus, duplicate: z.boolean() })
  .meta({ id: "UploadDocumentResponse" });
```

Kèm fixture `UploadDocumentResponse.json` và test trong `contracts.test.ts`.

`error.ts`: xem câu 1. **Schema DB: không đổi.** Bảng `documents` (plan 07) đã có đủ cột và unique checksum.

## Test và cách kiểm tra

- **Unit:**
  - `hash-to-temp-file` (case ở trên).
  - `detectFileType` (PDF, PNG, JPEG, text, buffer ngắn hơn 8 byte).
  - `LocalStorage` (put rồi file nằm đúng chỗ, remove, key có `..` → throw).
  - Env.
  - Filter 413/415.
- **Integration (`documents.int-spec.ts`).** File test là bytes PDF/PNG tối giản sinh trong code, có chữ SAMPLE, không dùng giấy tờ thật. Các case:
  - Staff upload PDF → 201, có 1 dòng `uploaded` đúng `staffId`/`checksum`/`sizeBytes`/`mimeType`, file có trong storage, `tmp/` rỗng.
  - Cùng staff upload lại cùng file → 200 `duplicate: true`, cùng `documentId`, vẫn 1 dòng.
  - Staff khác upload cùng file → 409, không thêm dòng, không thêm file.
  - Hai request cùng file chạy song song (`Promise.all`) → 1 dòng, cả hai trả cùng `documentId`.
  - File `UPLOAD_MAX_BYTES + 1` → 413, không dòng, `tmp/` rỗng. Test đặt env nhỏ (vd 1 KB) cho nhanh.
  - File text đổi đuôi `.pdf` → 415.
  - File rỗng, không có field `file`, 2 file, `declaredDocType` sai → 400.
  - `declaredDocType` hợp lệ được lưu.
  - Chưa đăng nhập → 401; reviewer/admin → 403.
- `make lint`, `make typecheck`, `make test`, `make test-int` xanh; CI xanh.
- **Kiểm tra tay:**
  - `curl` login staff, upload, upload lại thấy `duplicate: true`.
  - Kiểm tra bộ nhớ: upload file 10 MB, theo dõi RSS của process API không tăng tương ứng với kích thước file.

## Tiêu chí xong

- [x] Liam viết xong `hashToTempFile`, spec xanh, Claude review.
- [x] `POST /documents` chạy đúng mọi case integration ở trên.
- [x] Không có chỗ nào đọc cả file vào memory (không `Buffer.concat` toàn file, không `readFile`).
- [x] Upload cùng file 2 lần chỉ tạo 1 document (tiêu chí P1 trong roadmap).
- [x] Note `p1-stream-upload.md` + `progress.md` điền `code:`/`note:`.
- [x] STATUS cập nhật.

## Rủi ro / câu hỏi

1. **Mã lỗi cho 413 và 415 (đổi contract, cần Liam chốt).**
   - (a) Thêm `PAYLOAD_TOO_LARGE`, `UNSUPPORTED_MEDIA_TYPE` vào `ErrorCode`. Web hiện được câu báo riêng cho từng lỗi mà không phải đọc HTTP status.
   - (b) Không đổi contract: cả hai dùng `VALIDATION_FAILED`, phân biệt bằng HTTP status 413/415.
   - **Đề xuất (a).**
2. **409 làm lộ thông tin.** Staff B upload trúng file của staff A thì biết được "file này đã có người nộp". Với giấy tờ giả lập thì chấp nhận được, nhưng mình sẽ ghi vào note và "Học nâng cao" (sản phẩm thật: dedupe theo `(staff_id, checksum)`).
3. **Trả 413 khi client còn đang gửi.** Nếu API trả lỗi giữa chừng, Node có thể đóng kết nối và client thấy `EPIPE`/`ECONNRESET` thay vì đọc được 413. Cách xử lý: sau khi vượt giới hạn vẫn cho đọc tiếp và bỏ phần dư (`resume()`), rồi mới trả response. Mình sẽ có test khẳng định đọc được body 413.
4. **File mồ côi:** khi rename xong mà INSERT lỗi, hoặc process chết giữa chừng. Plan này chấp nhận để lại file đó, không dọn.
5. **Có cần ADR không.** Đề xuất có: ADR 0005 ngắn ghi lại busboy thay vì multer, dedupe toàn cục + 409, "ghi file trước, INSERT sau", và không tin `mimeType` client gửi.

## Ghi chú khi làm

- **busboy và stream bị destroy:** đọc source thì thấy file stream bị destroy giữa chừng (do `pipeline` khi lỗi) làm busboy không bao giờ phát `close`. Vì vậy `parseUpload` reject ngay khi file lỗi, không chờ busboy. Client ngắt kết nối thì destroy file stream (`req` phát `close` mà `!req.complete`).
- **Kiểm phần Claude viết:** Claude chạy lại test với một bản `hashToTempFile` tham khảo, để ngoài repo và không commit:
  - 81 unit, 56 integration xanh.
  - Bộ upload chạy riêng với `UPLOAD_MAX_BYTES` = 10 MB thật cũng xanh, không treo khi có backpressure.
  - Xong thì trả lại stub cho Liam.
- **Integration test:** `DATA_DIR` trỏ vào `os.tmpdir()/credflow-int-test`, `UPLOAD_MAX_BYTES` = 64 KB (`test/test-env.ts`).
- **`hashToTempFile` (2026-11-04):** Liam viết. Hai lỗi cuối (thiếu `async`, `rm` không `await` nên file tạm có thể còn khi đã reject) Claude sửa theo yêu cầu của Liam. Spec 8/8, unit 81, integration 56 xanh.
- **Kiểm tra tay (2026-11-04, `node dist/main.js` trên DB dev):**
  - Kết quả `curl`:
    - Upload: 201; upload lại: 200 `duplicate: true`.
    - Text đổi đuôi `.pdf`: 415. Chưa login: 401. Reviewer: 403.
    - Đúng 10 MB: 201. 10 MB + 1 byte: 413. Thư mục `tmp/` rỗng.
  - RSS so theo kích thước file (tạm nâng `UPLOAD_MAX_BYTES`): 1 MB → +0 MB, 150 MB → +95 MB, 600 MB → +70 MB. RSS không tăng theo file, xác nhận stream thật; phần tăng thêm là GC dọn Buffer chậm.
  - Đã xoá dữ liệu thử khỏi DB dev và `data/files`.
- **Sửa `DATA_DIR` tương đối:** đường dẫn này từng được tính từ thư mục đang chạy, nên `make dev-api` (chạy trong `apps/api`) ghi file ra `apps/api/data`. Giờ `storage.module.ts` tính nó từ gốc repo, giống `envFilePath`.

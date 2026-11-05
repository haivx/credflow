# 0006 · Hết retry thì chuyển người duyệt, chỉ file hỏng mới `failed`

Trạng thái: Đã chốt · Ngày: 2026-11-05 · Plan: `docs/plans/12-bullmq-worker.md`

## Bối cảnh

Tài liệu mâu thuẫn. Roadmap P1 ghi hết retry thì document sang `failed`. `docs/flows.md` F2 và FEATURE_MAP ghi lỗi kỹ thuật sau retry thì sang `needs_review`, chỉ file hỏng mới `failed`.

## Quyết định (Liam)

- Lỗi tạm hết lượt thử → `needs_review`, `routing = route([])` (`NO_RULES_EVALUATED`), `error` ghi bước lỗi kèm câu cố định.
- File không đọc được (`UnreadableFileError`) → `failed`, không retry.
- Sửa dòng roadmap cho khớp.

## Lý do

- Khớp nguyên tắc "không chắc thì chuyển cho người".
- `failed` bắt staff nộp lại, trong khi lỗi là của hệ thống, không phải của giấy.
- `NO_RULES_EVALUATED` nói đúng sự thật: chưa rule nào được chấm.

## Hệ quả

- Người duyệt có thể nhận ca chưa có kết quả trích xuất; màn duyệt (P4) phải hiển thị được ca này.
- Handler không chạy tới được bước ghi (DB chết đúng lượt cuối, job stalled hết lượt) thì document kẹt ở `processing`. Plan 13 phải sweep cả `processing` quá hạn.

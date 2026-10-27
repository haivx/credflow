# Plans

Mỗi task lớn có một file `NN-<slug>.md`, viết ở plan mode trước khi code, Liam duyệt rồi mới làm.
Đánh số tăng dần, không dùng lại số. Task nhỏ (sửa typo, đổi tên) không cần plan.

## Mẫu

```markdown
# NN · <tên task>

Phase: P_ · Trạng thái: Nháp | Đã duyệt | Xong · Ngày: YYYY-MM-DD

## Mục tiêu
Một hai câu: làm xong thì có gì mà bây giờ chưa có.

## Phạm vi
- Trong: ...
- Ngoài: ...

## Thay đổi
| File / module | Thay đổi |
| --- | --- |

## Contract / config / prompt bị ảnh hưởng
(nếu có, cần Liam duyệt riêng)

## Test và cách kiểm tra
- Unit test: ...
- Eval (nếu đụng prompt/model/rule): chạy `make eval`, so với run trước.
- Kiểm tra tay: ...

## Tiêu chí xong
- [ ] ...

## Rủi ro / câu hỏi
```

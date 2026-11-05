# Plans

Mỗi task lớn có một file `NN-<slug>.md`, viết ở plan mode trước khi code, Liam duyệt (cả verification plan ở cuối) rồi mới làm.
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

## Vùng kiến trúc bị chạm
(liệt kê file theo `docs/agent/architecture-zones.txt` sẽ sửa, hoặc "không")

## Contract / config / prompt bị ảnh hưởng
(nếu có, cần Liam duyệt riêng)

## Quyết định đáng nhớ
(3–5 dòng: chỗ khó nhất, phương án đã loại và vì sao, khi nào cách này hỏng)

## Tiêu chí xong
- [ ] ...
- [ ] Evidence report (skill `verify`) có trong PR, kết quả ✅ hoặc phần chưa kiểm đã được Liam chấp nhận.

## Rủi ro / câu hỏi

## Verification plan
(điền theo `docs/agent/templates/VERIFICATION_PLAN.md`: mức rủi ro T1/T2/T3, hành vi kỳ vọng,
các mức kiểm L0–L4 kèm lệnh, kịch bản, test mới phải đỏ trước, những gì sẽ không kiểm.
Đụng prompt/model/rule/ngưỡng: có dòng `make eval` so với run trước.)
```

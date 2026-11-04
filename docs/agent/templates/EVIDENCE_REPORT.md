# Evidence Report (mẫu)

> Do verify skill tạo ra ở cuối mọi task có đổi hành vi.
> Lưu ở `.verify/reports/<yyyy-mm-dd>-<ten-task-ngan>.md`.
> Mục **Tóm tắt** được dán vào tin nhắn cuối gửi Liam và vào mô tả PR.

---

## Tóm tắt
- **Task:** _một dòng_
- **Mức rủi ro:** T1 | T2 | T3
- **Kết quả:** ✅ ĐÃ KIỂM | ⚠️ KIỂM MỘT PHẦN | ❌ CHƯA KIỂM
- **Lệch so với plan đã duyệt:** _không có / danh sách_
- **Cần người để ý:** _không có / chỗ cụ thể cần xem_

## Static (L0)
```
$ make lint && make typecheck
<output đã cắt gọn, vài dòng cuối>
```

## Kịch bản

### 1. _tên kịch bản_
- **Mức:** L2 / L3
- **Lệnh:**
  ```
  $ ...
  ```
- **Quan sát được:**
  ```
  <JSON / output đã cắt gọn>
  ```
- **Screenshot:** `.verify/shots/...png` _(chỉ L3)_
- **Lỗi console / request lỗi:** 0 _(chỉ L3; khác 0 thì liệt kê)_
- **Kết luận:** qua / không qua — _lý do, một dòng_

### 2. ...

## Bằng chứng sửa bug _(chỉ với bug)_
- **Đỏ (trước khi sửa):** lệnh + output lỗi
- **Xanh (sau khi sửa):** cùng lệnh + output đã qua

## Test mới
| Test | Đã thấy đỏ trước? | Cách |
|---|---|---|
| `...` | có | revert bản sửa ở local, test đỏ với `...` |

## Fixture (chỉ với bước LLM / pipeline)
- Chạy fixture (`make eval`): `x/y` qua
- `falseApproveRate`: _số_ (lần trước: _số_)
- Không qua: _fixture → trường thiếu/sai_

## Chưa kiểm
- _cái gì, và vì sao_

## Thêm vào Watchlist
- _lỗi nào mình đã mắc rồi sửa mà một lint/check có thể bắt được → cũng thêm vào GUARDRAILS.md_

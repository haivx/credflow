# Verification Plan (mẫu)

> Mọi plan triển khai (`docs/plans/NN-<slug>.md`) phải kết thúc bằng mục này, điền đầy đủ.
> Liam duyệt plan **và** mục này cùng lúc.
> Plan không có verification plan thì chưa sẵn sàng để duyệt.

## Verification plan

**Mức rủi ro:** T1 | T2 | T3 — _một dòng lý do_

**Hành vi kỳ vọng (theo cách người dùng nói):**
- _vd Upload thẻ CPR đã hết hạn thì giấy vào hàng chờ duyệt (`needs_review`) với lý do `EXPIRED`, không bao giờ bị tự từ chối._

**Các mức kiểm:**
- [ ] L0 Static — `make lint`, `make typecheck` (luôn có)
- [ ] L1 Unit — `make test`: _logic nào_
- [ ] L2 Integration/API — `make test-int` và/hoặc gọi API đang chạy: _endpoint nào, user seed nào_
- [ ] L2 Eval — `make eval` (từ P2, bắt buộc khi đổi prompt/model/rule/ngưỡng): so với lần trước
- [ ] L3 E2E UI — _đường dẫn nào, screenshot nào_
- [ ] L4 Non-functional — _chỉ khi liên quan_

**Kịch bản sẽ chạy:**
| # | Kịch bản | Input / fixture | Kết quả quan sát được kỳ vọng |
|---|---|---|---|
| 1 | luồng chuẩn | `cpr-valid.png` (SAMPLE) | status `auto_approved`, có `holderName`, `issuerName`, `expirationDate` kèm evidence |
| 2 | ca biên | `cpr-expired.png` (SAMPLE) | status `needs_review`, `routing.reasons` có `EXPIRED` |
| 3 | lỗi | `unreadable.pdf` | status `failed` kèm `error.step`, không crash, không kẹt ở `processing` |

**Với bản sửa bug — tái hiện:**
- Lệnh cho thấy bug **trước** khi sửa: `...`
- Cùng lệnh đó phải qua **sau** khi sửa.

**Test mới phải đỏ trên code cũ:**
- _tên test_ — cách cho thấy nó đỏ trước (stash bản sửa / revert dòng / đổi input)

**Thay đổi feature map:** _dòng mới/đổi, hoặc "không có"_

**Những gì sẽ KHÔNG kiểm, và lý do:**
- _ghi rõ; "không có" chỉ hợp lệ khi đúng là vậy_

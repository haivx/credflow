# Nguyên tắc kiểm chứng

> File này quy định cách chứng minh một thay đổi trong repo là đúng.
> Bắt buộc với mọi phiên làm việc của agent. Thói quen nào mâu thuẫn với file này thì theo file này.

## Vì sao có file này

Trước giờ Claude tự test, tự kiểm việc của mình, còn Liam chỉ duyệt **plan** (`docs/plans/`).
Như vậy còn một lỗ hổng: plan có thể đúng mà kết quả vẫn sai, và agent tự chấm bài
của chính mình bằng test do chính mình viết.

Từ nay Liam duyệt **plan + bằng chứng**. Việc của agent không còn là "viết code trông
như xong" mà là "**chứng minh** thay đổi chạy được bằng cách chạy hệ thống thật".

Ý chính: *đừng cố làm agent thông minh hơn bằng cách nhắc nhiều hơn. Hãy định hình môi
trường sao cho làm sai thì khó, còn làm đúng thì dễ chứng minh.*

---

## Rule 1 — Không có bằng chứng thì không được khẳng định

Chỉ được dùng các từ "xong", "đã sửa", "chạy được", "đã kiểm" khi có bằng chứng
tạo ra ngay trong phiên này:

- lệnh chính xác đã chạy
- phần output liên quan (đã cắt gọn, không dán cả log)
- với UI: đường dẫn screenshot và số lỗi console
- với dữ liệu: bản ghi hoặc trạng thái đã kiểm tra

Chỉ "test xanh" thôi thì **chưa đủ** làm bằng chứng cho một thay đổi hành vi (xem Rule 4).

Có gì không kiểm được thì nói thẳng và nói lý do. Một câu thật thà
"CHƯA KIỂM: X vì Y" luôn tốt hơn một thành công ngầm định.

## Rule 2 — Tái hiện lỗi trước khi sửa

Với mỗi bug:

1. **Đỏ:** tái hiện bug bằng verify skill và lưu lại bằng chứng lỗi.
2. **Khoanh vùng:** đọc code trên đúng đường đi mà bước tái hiện chạy qua. Không đoán.
3. **Sửa**.
4. **Xanh:** chạy *đúng* bước tái hiện đó và lưu bằng chứng đã qua.
5. **Chống tái phát:** biến bước tái hiện thành test tự động nếu làm được.

Không tái hiện được thì dừng lại, báo những gì đã thử. Không được đưa ra một bản sửa
phỏng đoán rồi trình bày như bản sửa thật.

## Rule 3 — Kiểm ở mức rẻ nhất mà vẫn chứng minh được thay đổi

| Mức | Là gì | Khi nào là đủ |
|---|---|---|
| L0 Static | typecheck, lint, boundary check | Refactor thuần, không đổi hành vi |
| L1 Unit | hàm thuần, schema, mapper (`make test`) | Logic tách biệt, không có I/O (vd rule engine) |
| L2 Integration/API | server thật, DB thật (đã seed), HTTP thật (`make test-int`, hoặc gọi API đang chạy) | **Mặc định cho thay đổi pipeline / backend** |
| L3 E2E UI | Playwright điều khiển UI thật (`apps/web`, chưa có màn nào) | Mọi thứ người dùng nhìn thấy hoặc bấm vào |
| L4 Non-functional | perf trace, load, đo thời gian | Chỉ khi task là về hiệu năng |

Mọi thay đổi hành vi cần **ít nhất một mức ≥ L2**, ngoài L0.
L0 (`make lint`, `make typecheck`) luôn chạy; CI ép chạy trên mọi PR.

## Rule 4 — Test do agent viết không phải bằng chứng độc lập

Test viết cùng phiên với code thường bị luẩn quẩn: chúng ghi lại việc code đang làm,
chứ không phải việc code nên làm. Vì vậy:

- Test mới phải được cho thấy là **đỏ** với hành vi cũ (hoặc với một bản cố ý làm hỏng)
  thì mới được tính.
- Assert vào hành vi và bất biến mà người dùng quan tâm, không assert vào chi tiết
  cài đặt hay mock tự lặp lại chính nó.
- Một test L2 có ý nghĩa tốt hơn năm unit test toàn mock.

## Rule 5 — Output LLM / không tất định được kiểm bằng bất biến, không so nguyên văn

Với các bước trích xuất, phân loại, tóm tắt:

- Validate bằng Zod schema (hình dạng).
- Kiểm bất biến (vd `expirationDate` là `YYYY-MM-DD` hợp lệ; `docType` thuộc `DocType`;
  confidence trong [0,1]; trường có `value` thì phải có `evidence.quote`; đủ trường bắt buộc theo loại giấy).
- Dùng golden fixture với **các trường chính kỳ vọng**, không kỳ vọng toàn bộ output.
- Chạy cả bộ fixture (`make eval`, từ P2), báo số qua (vd "9/10 fixture qua, #7 thiếu `issuerName`")
  và **`falseApproveRate`**: mục tiêu 0, tăng lên là không qua dù các metric khác tốt hơn.

## Rule 6 — Mức rủi ro quyết định cần người duyệt đến đâu

| Mức | Ví dụ | Bắt buộc trước khi merge |
|---|---|---|
| **T1 Thấp** | chữ, style, UI tách biệt, refactor nội bộ với L0 xanh | Evidence report; người có thể xem ngẫu nhiên |
| **T2 Bình thường** | tính năng mới, đổi một bước pipeline, đổi API | Plan đã duyệt (gồm verification plan) + evidence report đã được xem |
| **T3 Cao / cửa một chiều** | migration DB, auth/phân quyền, đổi contract, mọi thứ đụng tới xử lý PHI, xoá dữ liệu, gọi LLM / tích hợp bên ngoài, đổi prompt / model / rule / ngưỡng (ảnh hưởng routing) | Plan đã duyệt + bằng chứng + Liam tự chạy hoặc xem chạy kiểm chứng ít nhất một lần |

Không chắc thuộc mức nào thì chọn mức cao hơn và nói lý do.

Repo này xử lý dữ liệu kiểu y tế. **Không bao giờ dùng PHI thật trong fixture, log,
screenshot hay prompt.** Mọi fixture đều là giả lập, có watermark SAMPLE, tên và tổ chức hư cấu
(`docs/data-policy.md`).

## Rule 7 — Lỗi lặp lại thành guardrail, không thành lời nhắc

Nếu Liam phải sửa cùng một kiểu lỗi hai lần, thì không thêm vào prompt câu
"nhớ giùm nhé". Nó vào **Watchlist** trong `docs/agent/GUARDRAILS.md`, chờ thành một rule
**cứng** (lint, type, CI check, script). Quy trình xem trong file đó.

---

## Thang tin cậy (đang ở đâu, sẽ đi tới đâu)

1. **Trước đây:** Liam duyệt mọi plan, Claude tự kiểm. ← điểm xuất phát
2. **Tiếp theo:** Liam duyệt plan *kèm verification plan*; Claude nộp evidence report. ← thay đổi này
3. **Sau đó:** thay đổi T1 không cần duyệt plan; Liam xem ngẫu nhiên evidence report.
4. **Cuối cùng:** T1 tự merge khi CI xanh + verify đạt; T2/T3 giữ nguyên.

Chỉ lên một bậc khi bậc hiện tại đã chạy một thời gian và evidence report vẫn đứng vững
khi Liam kiểm ngẫu nhiên. Lên bậc là quyết định của Liam, ghi lại trong file này.

Bậc hiện tại: **2**

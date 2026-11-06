# 22 · Thêm 4 ca khó làm tay, đóng P2

Phase: P2 · Trạng thái: Đã duyệt (Liam 2026-11-06: "tiếp đi" sau khi xem đề xuất) · Ngày: 2026-11-06

## Mục tiêu

Roadmap P2 đòi 10 ca khó làm tay trong `eval/hard-cases/`, hiện có 6. Làm xong thì có 10 ca, mỗi ca mới nhắm một chỗ yếu đã biết hoặc nghi ngờ của pipeline; output Haiku được ghi vào `eval/recorded/`; `make eval-ci` (cổng 0) chạy trên 40 ca dev; P2 đủ tiêu chí để đóng.

## Phạm vi

- **Trong:** 4 thẻ HTML → PNG (Chromium của Playwright, watermark SAMPLE, tên/tổ chức hư cấu hoặc staff seed), thêm vào `cases.json`, chạy Haiku thật một lần, `--record`, ghi baseline, đánh dấu P2 xong trong roadmap/STATUS.
- **Ngoài:** sửa rule, prompt hay ngưỡng nếu ca mới lộ lỗi. Ca mới lộ lỗi thì **báo và dừng**, sửa ở plan sau (T3); không nới cổng để PR này xanh.

## 4 ca mới

| Ca | Nhắm vào | Thẻ | Staff | Đáp án `decision` | Kỳ vọng hệ thống |
| --- | --- | --- | --- | --- | --- |
| `07-verbatim-ambiguous` | LLM có chép đúng chữ gốc không (lỗ hổng plan 21: quote bị chuẩn hoá thì rule không thấy mơ hồ) | Bố cục dày chữ, "Completed 10/9/2025", "Expires 10/9/2027" | Maren Ostrowe | `needs_review` | `DATE_INCONSISTENT` nếu quote đúng chữ in; nếu LLM chép "October 9, 2025" thì **duyệt nhầm** → cổng đỏ |
| `08-ordinal-date` | Chặn thừa của rule plan 21 | Giấy kiểu văn bản: "on this 14th day of March 2026 … valid until the 14th day of March, 2028" | Marisol Quennell | `auto_approve` (ngày rõ ràng) | Đã kiểm hàm: hai chữ gốc này ra `no_day` → `DATE_INCONSISTENT` → **chặn thừa** (giảm tự duyệt, không phải duyệt nhầm) |
| `09-vietnamese-name` | Tên có dấu so với hồ sơ không dấu | Thẻ in "NGUYỄN THỊ LAN ANH" (họ trước, có dấu, viết hoa) | Nguyen Thi Lan Anh (seed) | `auto_approve` | `nameMatches` bỏ dấu → khớp; LLM có giữ dấu trong quote không |
| `10-expired-yesterday` | Biên `EXPIRED` | "Expires November 5, 2026", `asOf` 2026-11-06 | Odalys Venn, tổ chức được chấp nhận | `needs_review` | `EXPIRED` (hết hạn trước `asOf` một ngày) |

Ca 08 là chỗ em đã biết trước: rule plan 21 nhận "March, 2028" là chỉ có tháng/năm vì không hiểu "14th day of". Ca này để eval đo chặn thừa; sửa ở plan sau nếu anh muốn.

## Cần anh duyệt riêng

| # | Vấn đề | Đề xuất |
| --- | --- | --- |
| 1 | Đáp án `decision` 4 ca | Như bảng trên |
| 2 | Ca mới làm cổng đỏ (duyệt nhầm) | Không nới `eval/gate.json`; PR vẫn mở với CI đỏ, em báo ca nào và vì sao, chờ anh quyết plan sửa. P2 chưa đóng cho tới khi cổng xanh |
| 3 | Đóng P2 | Khi 10 ca + cổng xanh: ghi "P2 xong" trong STATUS, đề xuất bước đầu P3 |

## Thay đổi

| File | Thay đổi |
| --- | --- |
| `eval/hard-cases/cpr/07…10.html`, `.png` | 4 thẻ mới |
| `eval/hard-cases/cpr/cases.json` | 4 `GoldenCase` mới (`asOf` 2026-11-06, split dev) |
| `eval/recorded/07…10.json` | output Haiku (`make eval ARGS=--record`) |
| `eval/report.md`, `docs/STATUS.md`, `docs/roadmap.md` | baseline 40 ca dev, đánh dấu P2 |

## Vùng kiến trúc bị chạm

Không. (`eval/**` không thuộc vùng; không sửa code, rule, prompt, config.)

## Contract / config / prompt bị ảnh hưởng

Không.

## Quyết định đáng nhớ

- **Chỗ khó nhất:** đáp án phải theo chính sách, không theo cái hệ thống đang làm được: ca 08 đáp án `auto_approve` dù biết trước hệ thống sẽ chặn, để eval nói thật về chặn thừa.
- **Đã loại:** sinh 4 ca này bằng synth: ca khó làm tay để bắt những dạng synth không có (văn bản dày chữ, ngày dạng thứ tự, tên tiếng Việt có dấu).
- **Khi nào hỏng:** Haiku không tất định; một lần ghi có thể khác lần sau (ca 07 đặc biệt). Output ghi sẵn cố định một lần; đo dao động để sau.

## Tiêu chí xong

- [ ] 4 thẻ có watermark SAMPLE, xem tay từng ảnh.
- [ ] `make eval` (thật) 40 ca dev; `--record`; `make eval-ci` cổng 0 xanh, **hoặc** báo ca duyệt nhầm và dừng (mục duyệt 2).
- [ ] Baseline 40 ca trong STATUS, report có ca 07–10.
- [ ] `make lint`, `make test` xanh; CI xanh.
- [ ] Evidence report trong PR.

## Rủi ro / câu hỏi

1. Chi phí: 4 ca × 2 lượt ≈ $0.003.
2. Ca 07 có thể làm cổng đỏ ngay (đó là mục đích của ca).

## Verification plan

**Mức rủi ro:** T2. Chỉ thêm dữ liệu eval; không đổi hệ thống. Nhưng đáp án quyết định cổng CI, nên đáp án được duyệt ở mục 1.

**Hành vi kỳ vọng:** eval có thêm 4 ca nhắm đúng chỗ yếu; số liệu nói thật cả duyệt nhầm lẫn chặn thừa.

**Các mức kiểm:**

- [ ] L0: `make lint` (prettier cho HTML, JSON).
- [ ] L1: `make test` (contract fixture không đổi; `cases.json` parse qua `GoldenCase` trong eval).
- [ ] L2 Eval: `make eval` thật (4 ca mới gọi LLM, 36 ca cũ từ cache), `--record`, `make eval-ci`.
- [ ] L3: xem tay 4 ảnh.

**Kịch bản:**

| # | Kịch bản | Kết quả kỳ vọng |
| --- | --- | --- |
| 1 | Render 4 thẻ, xem tay | đủ trường, đọc được, watermark |
| 2 | `make eval` | 40 ca dev, 8 lượt gọi LLM mới; xem quote của 07, 08, 09 trong cache |
| 3 | Ca 07 | quote đúng chữ in → `DATE_INCONSISTENT`; nếu chép chuẩn hoá → ghi lại, cổng đỏ, dừng |
| 4 | Ca 08 | `needs_review` vì `DATE_INCONSISTENT` (chặn thừa, đã dự đoán) |
| 5 | Ca 09, 10 | 09 `auto_approve`; 10 `EXPIRED` |
| 6 | `make eval ARGS="--record --no-save"`, `make eval-ci` | 40 file recorded; cổng theo kết quả trên |

**Test mới phải đỏ trước:** không có test code mới. Ca eval mới được tính khi xem quote thật trong cache và đối chiếu với kỳ vọng ở bảng trên (đúng hoặc giải thích được).

**Thay đổi feature map:** mục Eval: 10 ca hard-cases.

**Những gì sẽ KHÔNG kiểm, và lý do:**

- Dao động của Haiku trên 4 ca mới (một lần ghi).

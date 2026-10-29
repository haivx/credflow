# Case study: CredFlow

> Khung writeup, điền dần từ P2 và hoàn thiện ở P6. Viết bằng tiếng Anh khi hoàn thiện 
> Nguyên tắc: mọi con số phải lấy từ `eval/report.md` trên holdout; ghi rõ giới hạn.

## 1. Problem

- Ai đau, đau ở đâu: compliance đọc tay từng giấy tờ, onboard chậm, sót giấy hết hạn.
- Vì sao khó: giấy không có mẫu chuẩn; sai một lần (duyệt nhầm giấy hết hạn) là rủi ro audit.
- Bối cảnh của tôi: đã làm trên nền tảng healthcare SaaS có quy trình credentialing.

## 2. Design principles

- LLM reads, code decides.
- Precision over recall: không chắc thì chuyển cho người.
- Evidence for every field.
- Rules as per-client configuration.

## 3. Architecture

(sơ đồ pipeline; vì sao workflow thay vì agent)

## 4. Key trade-offs

| Quyết định | Phương án đã cân nhắc | Lý do chọn | Bằng chứng |
| --- | --- | --- | --- |
| Vision thuần vs OCR + LLM | | | (bảng eval P5) |
| Không tự từ chối | | | |
| ... | | | |

## 5. Evaluation

- Golden set: kích thước, cách sinh, ca khó, dev/holdout.
- Bảng metric holdout: falseApproveRate, autoApproveRate, độ chính xác theo trường, chi phí, độ trễ.
- Cắt theo tag: hệ thống yếu ở đâu.
- Những gì người duyệt hay sửa nhất.

## 6. Limitations

- Dữ liệu giả lập dễ hơn thực tế; số liệu là cận trên.
- Chưa thử với giấy tờ thật / người dùng thật.

## 7. What I would do next

(ví dụ: agent thử lại ca khó có giới hạn, trợ lý cho người duyệt)

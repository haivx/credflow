# tools/synth

Bộ sinh giấy tờ giả lập kèm đáp án. Hiện thực ở P2.

## Cách làm

1. Template HTML cho từng loại giấy trong `templates/<docType>/<layout>.html`, thiết kế từ `docs/research/layout-notes.md`.
2. Điền dữ liệu ngẫu nhiên có seed: tên hư cấu, tổ chức hư cấu, ngày (gồm ca đã hết hạn, sắp hết hạn), biến thể tên ("DOE, JANE", "J. Doe").
3. Render PNG/PDF (Playwright).
4. Thêm nhiễu: xoay, mờ, phối cảnh như ảnh chụp, nén JPEG, nhiều trang.
5. Ghi file vào `data/synth/<docType>/` và `GoldenCase` JSON tương ứng.

## Bắt buộc

- Watermark `SAMPLE` / `SPECIMEN` trên mọi giấy (`docs/data-policy.md`).
- Không dùng tên, logo, mẫu thẻ của tổ chức thật.
- Cùng `--seed` → cùng bộ dữ liệu.

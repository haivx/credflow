# tools/synth

Sinh thẻ CPR giả lập kèm đáp án (plan 19). Mọi thẻ có watermark `SAMPLE`, tên người và tổ chức hư cấu (`docs/data-policy.md`).

## Chạy

```bash
pnpm --filter @credflow/synth exec playwright install chromium   # một lần, khoảng 100 MB
make synth            # SEED=1
make synth SEED=2     # bộ khác
```

Ghi vào `data/synth/cpr/` (không commit): ảnh/PDF `synth-cpr-NNNN.{png,jpg,pdf}`, HTML đã điền (để xem và gỡ lỗi), `cases.json` (`GoldenCase[]`). Thư mục này bị xoá và ghi lại mỗi lần chạy.

`make eval` tự đọc `data/synth/cpr/cases.json` nếu có.

## Cách làm

- `src/policy.ts`: bảng 13 kịch bản (số ca, tag, `decision`), Liam duyệt ở plan 19. **Không import rule engine**: đáp án phải độc lập với thứ được đo. Đổi bảng là đổi chính sách, phải qua plan.
- `src/scenarios.ts`: sinh sự thật của từng thẻ (ngày so với `asOf` 2026-11-06, tên, tổ chức, bố cục, nhiễu) và `GoldenCase`.
- `src/rng.ts`: mulberry32 có seed. Không dùng `Math.random` (có test quét).
- `templates/cpr/*.html`: 4 bố cục (`renewal-bar`, `certificate`, `wallet-validity`, `valid-through`), placeholder `{{field}}` được escape.
- `src/render.ts`: Playwright Chromium; nhiễu (xoay, mờ, nghiêng) bằng CSS, chụp JPEG chất lượng thấp; giấy chứng nhận xuất PDF (giờ tạo trong PDF được thay bằng mốc cố định).
- 30 ca `dev`, 10 ca `holdout`: holdout chỉ chạy khi chốt kết quả, không dùng để chỉnh prompt hay ngưỡng.

## Tái lập

Cùng seed → `cases.json` và HTML giống từng byte. Ảnh và PDF giống từng byte trên cùng máy với cùng bản Playwright/Chromium; khác máy (font) hoặc nâng Playwright thì ảnh đổi, cache LLM của eval (theo sha256 file) trượt và eval gọi lại LLM (khoảng $0.03).

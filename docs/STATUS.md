# STATUS

> Claude đọc file này đầu phiên, cập nhật sau **mỗi bước**. Tối đa 40 dòng (`tools/lint/status-size.test.mjs`); lịch sử ở `docs/archive/status-2026-11.md`. Mở phiên mới: `/tiep`.

**Cập nhật:** 2026-11-08 · **Phase:** P6a · Deploy lên Railway (thứ tự P4.5 → P6a → P5 → P6b; ADR 0013). P0–P4 xong; P4.5 còn plan 31, 32.
**Production:** https://web-production-5b171.up.railway.app · vận hành: `docs/deploy.md`

## Đang làm

- **Plan 37 dọn context, gỡ pr-reviewer:** nhánh `docs/37-don-context`, đang làm.

## Tiếp theo

1. **Backup Postgres trên Railway + thử khôi phục thật một lần** (Liam làm, Claude hướng dẫn theo chế độ dạy).
2. **Bật Google trên production (plan 36, đã merge PR #58):** Liam tạo OAuth client, đặt 4 biến `GOOGLE_*`/`OAUTH_STATE_SECRET` cho `api`, thêm Gmail vào Test users, thử thật.
3. **Liam trên Railway/Console:** Hobby + Usage Limits (soft ~$10, hard ~$20); spend limit Anthropic; kiểm plan 34 (rate limit) trên production.
4. **Case study** `docs/case-study.md`: viết quanh plan 19 → 21 (eval tìm ra duyệt nhầm, code đọc `evidence.quote`), bảng eval, giới hạn.
5. **Sau P6a:** P4.5 plan 31 (S2/S3, bỏ `data-legacy`), 32 (bàn phím); rồi P5 (4 loại giấy còn lại).

## Vướng / câu hỏi mở

- Hai việc nhỏ từ plan 29: màn staff hiện `LOW_CONFIDENCE` ở cột Lý do cho giấy **đã duyệt**; ca 05 trong eval dùng config default còn seed Odalys thuộc Bayleaf (cân nhắc ghi rõ trong `cases.json`).
- Lệch phiên bản dev/production: Postgres 16 / 18.6, Node 24 / 22.
- Kiểm tay để phase cuối (T3, Liam 2026-11-06): danh sách ở archive, mục "Kiểm tay để phase cuối".

## Eval mới nhất

- 2026-11-06, plan 25: dev 44 ca `falseApproveRate` **0/44**, `autoApproveRate` 56.8%; holdout 0/10 (plan 24). `eval-ci` cổng 0. Chi tiết: `eval/report.md`, lịch sử: archive.

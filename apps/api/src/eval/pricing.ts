/**
 * Giá `claude-haiku-5-5` cho prompt ≤ 100K token (prompt của ta khoảng 1–4K).
 * Nguồn: bảng giá trong skill `claude-api` (cache 2026-10-06), Liam xác nhận 2026-11-06 (plan 18).
 * Đổi model hoặc giá đổi thì sửa ở đây; report ghi rõ là số ước tính.
 */
export const PRICE_USD_PER_MTOK = { input: 0.1, output: 0.5 } as const;

# Guardrails

> Rule mềm (file này, CLAUDE.md, skill) có thể bị quên.
> Rule cứng (type, lint, CI, script, hook) thì không.
> File này là quy trình biến loại thứ nhất thành loại thứ hai.

## Các lớp cưỡng chế (mạnh → yếu)

1. **Kiến trúc:** mỗi việc chỉ có một chỗ / một cách làm hiển nhiên
   (thư mục theo feature, ranh giới có type, schema dùng chung). Agent chép pattern có sẵn,
   nên pattern có sẵn phải là pattern đúng.
2. **Compiler / type:** TS strict, Zod ở mọi ranh giới, không `any`.
3. **Lint + boundary check:** làm build đỏ khi gặp pattern đã biết là sai hoặc import trái phép.
4. **Hook:** hook của Claude Code chạy check L0 sau mỗi lần sửa, ngay trong vòng làm việc.
5. **CI:** cùng các check đó, cộng test và bộ fixture, chặn merge.
6. **Skill / CLAUDE.md / file này:** hướng dẫn. Có ích, nhưng không bao giờ là tuyến phòng thủ duy nhất.

Mục tiêu: mọi rule quan trọng nằm ở lớp 1–5. Lớp 6 giải thích *vì sao*.

## Quy trình: lỗi bị chỉnh lại → rule cứng

Khi Liam phải chỉnh lại một lỗi Claude mắc (hoặc Claude tự phát hiện mình mắc lại một kiểu lỗi):

1. **Lần đầu:** sửa. Thêm một dòng vào **Watchlist** bên dưới.
2. **Lần thứ hai (cùng kiểu):** nâng cấp, đề xuất rule cứng thành một thay đổi nhỏ riêng:
   - lint rule (`no-restricted-imports`, `no-restricted-syntax`, rule tự viết), hoặc
   - boundary rule (dependency-cruiser / eslint-plugin-boundaries), hoặc
   - đổi type (làm cho trạng thái sai không biểu diễn được), hoặc
   - script / CI check, hoặc
   - đổi cấu trúc (chuyển code sao cho import sai là không thể).
3. Đề xuất phải có: rule, một ví dụ nó bắt được, bằng chứng nó không báo nhầm trên
   codebase hiện tại (hoặc danh sách chỗ nó báo + cách sửa).
4. Merge xong thì chuyển dòng đó từ **Watchlist** sang **Active**, kèm cơ chế cưỡng chế.

Comment khi review là dấu hiệu: người viết "đừng làm X" trên một thay đổi thì mặc định
đó là một dòng mới cho Watchlist.

## Active (đã cưỡng chế)

| # | Rule | Vì sao | Cưỡng chế bằng |
|---|---|---|---|
| A1 | Không có dữ liệu cá nhân/y tế thật trong fixture, log, screenshot, prompt (`docs/data-policy.md`) | tuân thủ | review + `.gitignore` (`real-docs/`, `data/`, `.env`); `TODO: lint fixture (bắt buộc chữ SAMPLE)` |
| A2 | Mọi input từ bên ngoài (request, output LLM, file config, golden set) phải parse bằng Zod trước khi dùng | ranh giới tin cậy | `ZodValidationPipe`, `RulesConfig` khi khởi động; `TODO: kiểm ngoài quy ước` |
| A3 | `packages/rules` là hàm thuần: engine không import I/O, LLM, `apps/*`, không gọi `Date.now()` | kiến trúc (CLAUDE.md) | `TODO: no-restricted-imports / no-restricted-syntax cho packages/rules/src/engine.ts` |
| A4 | LLM không bao giờ quyết định duyệt; chỉ `auto_approve` khi mọi rule `block` qua | nguyên tắc sản phẩm | contract `RoutingDecision` (không có nhánh reject); `TODO: test bất biến routing + eval falseApproveRate` |
| A5 | Ngày lịch là chuỗi `YYYY-MM-DD`, không dùng `Date` | lệch múi giờ | contract `IsoDate`; `TODO: lint` |

> A4 cũ của mẫu (TanStack Query) bỏ: `apps/web` chưa dùng và chưa có màn nào. Thay bằng các rule
> "không được vi phạm" của CLAUDE.md.
>
> Lần setup đầu, agent kiểm xem rule nào thật sự đang được cưỡng chế, rồi thay mỗi
> `TODO` bằng cơ chế thật hoặc đề xuất thêm cơ chế.

## Watchlist (đã thấy, chưa cưỡng chế)

| Ngày | Sai ở đâu | Số lần gặp | Rule cứng đề xuất |
|---|---|---|---|
| | | | |

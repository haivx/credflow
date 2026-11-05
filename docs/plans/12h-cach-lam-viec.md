# 12h · Bỏ chế độ lai, thu hẹp `permissions.ask`

Phase: P1 · Trạng thái: Đã code, còn kịch bản 4 chờ Liam kiểm ở phiên mới · Ngày: 2026-11-05
Nhánh `chore/12h-cach-lam-viec` từ `origin/main`, một PR riêng.

**Lệch so với plan đã duyệt:**

- Số prompt nhiều hơn dự kiến: thêm một lần sửa định dạng `ask` cho Prettier, và các lần thử/khôi phục ở kịch bản 4.
- Kịch bản 4 chưa có lần bị từ chối thật, xem evidence report.

## Mục tiêu

Claude code toàn bộ plan, Liam duyệt plan + PR. Prompt `ask` chỉ còn ở 2 đường dẫn tắt được cổng; vùng kiến trúc được kiểm bằng plan khai trước + CI `architecture-zones` + owner merge.

## Phạm vi

- **Trong:** tài liệu, lệnh `/tiep` `/wrap`, `.claude/settings.json`, test đồng bộ, PR template.
- **Ngoài:** code ứng dụng, `deny`, danh sách vùng, job CI.
- **Không sửa lịch sử:** các plan cũ và comment `🎓 Liam tự viết (plan 11)` trong `hash-to-temp-file.ts` vẫn đúng với lúc đó.

## Plan 12

PR #24 đã merge (`e26d61a`), không còn phần nào chờ Liam viết. Chỉ cập nhật trạng thái trong `docs/plans/12-bullmq-worker.md` và STATUS, plan tiếp theo vẫn là plan 13.

## Thay đổi

### A. Bỏ chế độ lai

| File | Thay đổi |
| --- | --- |
| `CLAUDE.md` | Thay mục "Chế độ dạy" bằng "Quyết định đáng nhớ" (3–5 dòng: chỗ khó nhất, phương án đã loại và vì sao, khi nào cách này hỏng) + "vượt mức thì ghi Học nâng cao". Sửa mục Vai trò, bước 1 và 3 của quy trình, dòng `docs/learning` trong Cấu trúc repo |
| `docs/plans/README.md` | Mẫu plan thêm "Quyết định đáng nhớ", "Vùng kiến trúc bị chạm" (file theo `architecture-zones.txt`, hoặc "không"). Mẫu này chưa có "Liam tự viết" nên không có gì để bỏ; `CLAUDE.md` thì có |
| `docs/STATUS.md` | Bỏ "Đang học", bỏ câu hỏi `@Inject(DB)` |
| `.claude/commands/tiep.md`, `wrap.md` | Bỏ bước `progress.md`, "Tự kiểm", "chờ Liam code"; `/wrap` ghi "Học nâng cao" vào roadmap |
| `docs/roadmap.md` | Giữ 🎓 và "Học nâng cao". Dòng 5 ghi không còn bắt buộc tự code. Dòng 125 hiện ghi "làm khi đã tick hết `progress.md`" nên đổi điều kiện thành "khi xong MVP" |
| `docs/learning/README.md` | Thêm một dòng: dừng cập nhật từ 2026-11-05, giữ làm lưu trữ |
| `docs/agent/GUARDRAILS.md` | Câu "Luật giữ ở lớp mềm" đang liệt kê "chế độ dạy, giải thích trước khi code": bỏ cho khớp |

### B. Thu hẹp `ask`

| File | Thay đổi |
| --- | --- |
| `.claude/settings.json` | `ask` còn `Edit(/.claude/settings.json)`, `Edit(/.claude/hooks/**)`. `deny` giữ nguyên |
| `tools/lint/architecture-zones.test.mjs` | Thay test "ask đúng bằng các vùng" bằng: `ask` đúng bằng danh sách cố định; ca thiếu từng đường dẫn thì check ném lỗi; mỗi đường dẫn trong `ask` vẫn thuộc danh sách vùng. Giữ test `Write(` và `deny` |
| `docs/agent/architecture-zones.txt` | **Danh sách giữ nguyên.** Chỉ sửa comment dòng 4–5, vì câu "thêm/bớt dòng thì sửa cả `permissions.ask`" sẽ sai |
| `docs/agent/GUARDRAILS.md` | Viết lại A8: 3 lớp và vai trò của `ask`. Thêm dòng Watchlist "PR chạm vùng kiến trúc mà plan không khai trước". Dòng Watchlist KB7 đang nói "tool Edit thì có prompt" nên sửa cho đúng |
| `CLAUDE.md` | Bước 3: rule "chỉ sửa vùng bằng Edit/Write để hiện prompt" chỉ còn áp cho 2 đường dẫn trong `ask`; vùng khác phải được khai trong plan |
| `.github/pull_request_template.md` | Thêm câu hỏi "Vùng kiến trúc bị chạm có khớp với plan không?" |

### Ngoài repo

Memory của Claude: sửa `boilerplate-vs-learning`, `user-learning-goal` cho khớp cách làm mới.

## Quyết định đáng nhớ

- **Chỗ khó nhất:** bỏ "Đang học" mà vẫn phải mở lại được phiên đang dở. Vì vậy chuyển "bước đã xong, bước tiếp theo, câu hỏi treo" vào "Đang làm", giữ rule cập nhật sau mỗi bước.
- **Đã loại:** để test chỉ kiểm `ask` có chứa 2 đường dẫn. Cách đó không đỏ khi `ask` bị nới rộng trở lại, nên dùng so khớp đúng bằng.
- **Khi nào hỏng:** Claude sửa vùng ngoài plan thì không còn prompt nào chặn lúc sửa; chỉ thấy qua cảnh báo CI (không fail) và mắt owner khi merge. Dòng Watchlist mới là tín hiệu để làm check tự động.

## Vùng kiến trúc bị chạm

`CLAUDE.md`, `docs/agent/GUARDRAILS.md`, `docs/agent/architecture-zones.txt` (chỉ comment), `.claude/settings.json`, `tools/lint/architecture-zones.test.mjs`, `.github/pull_request_template.md`.

## Contract / config / prompt bị ảnh hưởng

Không.

## Tiêu chí xong

- [ ] Không còn nhắc "Đang học", "Chế độ dạy", "Tự kiểm", `progress.md` như quy trình đang chạy, ngoài `docs/learning/` và plan cũ.
- [ ] `ask` đúng 2 đường dẫn; `deny` và danh sách vùng không đổi (kiểm bằng diff).
- [ ] `make lint` xanh; CI `architecture-zones` liệt kê đúng các file đã khai ở trên.
- [ ] Evidence report trong PR.

## Rủi ro / câu hỏi

1. **Rule "không tự ý đổi contract, schema DB, rule, prompt, model" giữ nguyên** nhưng không còn prompt nhắc lúc sửa. Đây là đánh đổi Liam đã chọn; ghi rõ ở A8.
2. **`.claude/settings.json` có thể chưa nạp lại ngay trong phiên.** Nếu kiểm thử cho kết quả như cũ, mình sẽ báo và nhờ bạn mở lại phiên rồi thử lại, không kết luận từ lần đó.
3. **Số prompt bạn sẽ gặp:** 2 lần Yes khi sửa `settings.json` (bước đỏ rồi xanh), 1 lần No khi thử.

## Verification plan

**Mức rủi ro:** T2. Đổi quy trình và quyền của agent, không đổi hành vi sản phẩm, đảo ngược được.

**Hành vi kỳ vọng:**

- Sửa file vùng kiến trúc khác không còn hiện prompt.
- Sửa `.claude/settings.json` vẫn hiện prompt.
- Lệnh merge, push `main` vẫn bị deny như cũ.

**Các mức kiểm:**

- [ ] L0: `make lint` (gồm test đồng bộ vùng), `make typecheck`.
- [ ] L1: `node --test tools/lint/architecture-zones.test.mjs`.
- [ ] L2: thử tool Edit thật trong phiên (kịch bản 3, 4).
- [ ] L2 Eval, L3, L4: không áp dụng. Không chạy `make test-int` vì không đụng code; CI vẫn chạy.

**Kịch bản:**

| # | Kịch bản | Cách chạy | Kết quả quan sát được |
| --- | --- | --- | --- |
| 1 | Đỏ: thiếu `hooks` | Sửa test trước, rồi thu `ask` còn mỗi `settings.json` | Test đồng bộ đỏ, chỉ rõ thiếu `Edit(/.claude/hooks/**)` |
| 2 | Xanh | Thêm lại `hooks` | Test xanh, `make lint` xanh |
| 2b | Đỏ: thiếu `settings.json` | Ca trong test đưa check một danh sách thiếu đường dẫn này; tạm đổi check cho thấy ca đó đỏ. Không sửa file thật, để đỡ 2 prompt | Ca đó đỏ rồi xanh |
| 3 | Vùng khác không bị hỏi | Edit thêm một comment vào `eslint.config.mjs`, rồi Edit gỡ | Tool chạy không prompt. **Liam xác nhận** vì mình không thấy được màn hình prompt. `git diff` file này rỗng |
| 4 | `settings.json` vẫn bị hỏi | Edit thử, Liam trả lời No | Tool báo bị từ chối, file không đổi |
| 5 | `deny` không đổi | `git diff` phần `deny`, test `deny` | Không có dòng đổi, test xanh |
| 6 | CI cảnh báo đủ | Xem job summary `architecture-zones` trên PR | Đúng danh sách ở mục "Vùng kiến trúc bị chạm" |

**Test mới phải đỏ trên code cũ:** kịch bản 1, 2b.

**Thay đổi feature map:** không có.

**Những gì sẽ KHÔNG kiểm, và lý do:**

- `Edit(/.claude/hooks/**)` có hỏi thật không: chưa có thư mục này, chỉ kiểm bằng test.
- Lệnh deny có còn bị chặn lúc chạy không: không chạy thử lệnh merge hay push `main`, chỉ kiểm diff và test.
- Lách bằng script: đã đo ở plan 12f, không đổi.

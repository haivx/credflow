# 12j · Sửa deny rule xoá nhánh bằng dấu hai chấm

Phase: P1 · Trạng thái: Đã duyệt, đang làm · Ngày: 2026-11-05
Nhánh `fix/12j-deny-push-colon` từ `origin/main`, một PR riêng.

## Mục tiêu

Rule `Bash(git push * :*)` trong `.claude/settings.json` hiện không có tác dụng: Claude Code hiểu `:*` ở cuối là cú pháp prefix kiểu cũ, nên `*` ở giữa thành ký tự thật. Hệ quả: `git push origin :ten-nhanh` xoá được nhánh remote dù deny đã liệt kê (đã đo trên repo tạm). Làm xong thì lệnh này bị chặn, và test tự phát hiện nếu có rule nào viết sai kiểu này.

## Phạm vi

- **Trong:** sửa 1 rule deny, cập nhật test đang ghim chuỗi rule cũ, thêm 1 test kiểm cú pháp rule.
- **Ngoài:**
  - Chặn `git push` và `git push origin HEAD` khi đứng trên `main` (Liam đã quyết không gộp; GitHub ruleset vẫn chặn).
  - Viết hook `PreToolUse` cho `git push`.
  - Sửa các rule deny khác.

## Thay đổi

| File | Thay đổi |
| --- | --- |
| `.claude/settings.json:23` | `Bash(git push * :*)` → `Bash(git push * :**)`, sửa bằng tool Edit (hiện prompt để Liam duyệt) |
| `tools/lint/architecture-zones.test.mjs:80` | Đổi chuỗi rule đang ghim sang dạng mới |
| `tools/lint/architecture-zones.test.mjs` (`describe` settings) | Test mới: không rule `Bash(...)` nào trong `allow`, `ask`, `deny` vừa kết thúc bằng `:*` vừa có `*` ở phần trước |
| `docs/agent/GUARDRAILS.md` | Ghi vào hàng A8: `:*` ở cuối rule không phải wildcard, test mới giữ việc này |

Cách làm với 12i đang dở: `chore/12i-pr-reviewer` còn thay đổi chưa commit, nên 12j làm trong worktree riêng từ `origin/main`, không đụng nhánh đó. `docs/STATUS.md` chỉ cập nhật ở checkout chính, đi theo 12i, để hai PR không xung đột.

## Vùng kiến trúc bị chạm

`.claude/settings.json`, `docs/agent/GUARDRAILS.md`, `tools/lint/architecture-zones.test.mjs`. Hai file đầu đã có trong `docs/agent/architecture-zones.txt`. File test: sẽ đối chiếu với danh sách vùng khi làm và ghi kết quả vào evidence; dù thế nào cũng coi là đã khai ở đây.

## Contract / config / prompt bị ảnh hưởng

Không có. `.claude/settings.json` là cấu hình guardrail, không phải config rule nghiệp vụ.

## Quyết định đáng nhớ

- **Chỗ khó nhất:** tên nhánh nằm ngay sau dấu hai chấm, nên rule tự nhiên sẽ kết thúc bằng `:*` và rơi vào cú pháp prefix cũ. Viết `:**` thì đuôi không còn là `:*`.
- **Đã loại:** làm theo gợi ý `Bash(git push *)`, vì chặn mọi lệnh push và Claude không tạo được PR. Hook `PreToolUse`, vì thêm code bảo trì cho một lỗ đã bịt được bằng một dòng.
- **Khi nào hỏng:** `:**` dựa trên cách Claude Code đọc rule hiện nay, và Claude Code vẫn in một cảnh báo thông tin cho dạng này. Nếu bản sau đổi cách đọc, rule có thể lại mất tác dụng mà test cú pháp không biết; khi đó chuyển sang hook.
- **Giới hạn của test:** test mới chỉ kiểm chuỗi rule, không chạy Claude Code. Hành vi thật được đo bằng kịch bản L2 bên dưới, chỉ một lần trong PR này.

## Tiêu chí xong

- [ ] `git push origin :victim` bị deny; `git push origin work:feature-x` vẫn chạy (đo trên repo tạm).
- [ ] Test cú pháp mới đỏ trên rule cũ, xanh trên rule mới.
- [ ] `make lint`, `make typecheck`, `make test` xanh; CI xanh.
- [ ] Evidence report (skill `verify`) có trong PR, kết quả ✅ hoặc phần chưa kiểm đã được Liam chấp nhận.
- [ ] Chạy `pr-reviewer` nếu chạy được (xem Rủi ro), dán kết luận vào PR. Liam tự merge.

## Rủi ro / câu hỏi

- **`pr-reviewer` có thể không chạy được trong worktree:** agent và hook của nó chỉ có ở 12i chưa commit, còn worktree từ `origin/main` không có `.claude/hooks/pr-reviewer-bash.mjs`. Hook hỏng sẽ chặn Bash của reviewer. Nếu vậy thì ghi rõ trong PR là chưa chạy, không chạy trên nhánh khác để lấy kết luận. Rule bắt buộc reviewer cũng chưa có trên `main` cho tới khi 12i merge.
- **Lỗ còn lại, chấp nhận:** deny chỉ khớp lệnh viết đúng dạng. Các cách viết khác như `git push origin refs/heads/x --delete` đã có rule riêng, nhưng script tự gọi git thì vẫn lách được, giống giới hạn đã ghi ở A8.

## Verification plan

**Mức rủi ro:** T2 — sửa guardrail chặn lệnh phá hoại, không chạm code ứng dụng. Sai theo hướng quá rộng sẽ chặn mọi push.

**Hành vi kỳ vọng:**
- Claude chạy `git push origin :ten-nhanh` thì bị từ chối, nhánh remote còn nguyên.
- Claude vẫn push nhánh feature được, kể cả dạng `git push origin nguon:dich`.

**Các mức kiểm:**
- [ ] L0 Static — `make lint` (gồm `node --test tools/lint/*.test.mjs`), `make typecheck`
- [ ] L1 Unit — `make test`; `node --test tools/lint/architecture-zones.test.mjs`
- [ ] L2 Integration — chạy Claude Code thật (`claude -p`, model `claude-haiku-5-5`) trên repo tạm + bare remote tạm trong scratchpad, đọc đúng `.claude/settings.json` đã sửa
- [ ] L2 Eval — không áp dụng, không đổi prompt, model, rule nghiệp vụ, ngưỡng
- [ ] L3 E2E UI — không áp dụng, không có UI
- [ ] L4 Non-functional — không áp dụng

**Kịch bản sẽ chạy:**

| # | Kịch bản | Input | Kết quả quan sát được kỳ vọng |
|---|---|---|---|
| 1 | Rule cũ (đỏ) | deny `Bash(git push * :*)`, lệnh `git push origin :victim` | Lệnh chạy, nhánh `victim` mất trên remote tạm |
| 2 | Rule mới chặn | `settings.json` đã sửa, cùng lệnh | Báo permission denied, nhánh `victim` còn |
| 3 | Push thường | `settings.json` đã sửa, `git push origin work:feature-x` | Nhánh `feature-x` xuất hiện trên remote tạm |
| 4 | Push nhánh feature | `settings.json` đã sửa, `git push origin work` khi `work` có commit mới | Push thành công |
| 5 | Rule main không đổi | `settings.json` đã sửa, `git push origin main` trên repo tạm | Vẫn bị deny |

Kịch bản 1–3 đã chạy thử một lần trước khi viết plan, với rule chép tay. Khi làm sẽ chạy lại với đúng file đã sửa, và script phải dừng ngay khi một bước dựng repo lỗi. Lần thử đầu từng cho kết quả giả vì lỗi đối số CLI, nên mỗi kịch bản phải in output thật của lệnh, không chỉ trạng thái nhánh.

**Với bản sửa bug — tái hiện:**
- Trước khi sửa: kịch bản 1, nhánh `victim` bị xoá.
- Sau khi sửa: cùng lệnh đó ở kịch bản 2, nhánh `victim` còn.

**Test mới phải đỏ trên code cũ:**
- Test cú pháp rule mới: chạy trước khi sửa `settings.json`, phải đỏ và nêu đúng `Bash(git push * :*)`.
- Sửa chuỗi ghim ở dòng 80 là cập nhật theo rule mới, không nới: test vẫn yêu cầu rule có mặt.

**Thay đổi feature map:** không có.

**Những gì sẽ KHÔNG kiểm, và lý do:**
- Toàn bộ các rule deny khác: ngoài phạm vi, chỉ lấy `git push origin main` làm đối chứng.
- Push và xoá trên GitHub thật: không xoá nhánh thật để thử; remote tạm đủ để đo vì deny chặn trước khi git chạy.
- `git push` trần khi đứng trên `main`: Liam đã quyết để ngoài plan này.
- Phiên tương tác: chỉ đo bằng `claude -p`, giả định dùng chung cách đọc rule permission với phiên tương tác.

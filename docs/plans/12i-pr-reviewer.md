# 12i · Subagent `pr-reviewer`

Phase: P1 · Trạng thái: Đã duyệt, đang làm · Ngày: 2026-11-05
Nhánh `chore/12i-pr-reviewer` từ `origin/main`, một PR riêng.

**Lệch so với plan đã duyệt:**

- Sửa thêm `.gitignore` (`!.claude/agents/`): nếu không, file agent không vào được git. File này không thuộc vùng kiến trúc.
- Ca đỏ của hook: `git diff; rm x` không đỏ khi bỏ bước chặn ký tự, vì `diff;` tự rớt khỏi danh sách cho phép. Thêm ca `git diff HEAD; rm x`, ca này đỏ.

## Mục tiêu

Trước khi báo PR sẵn sàng, một subagent chỉ đọc đối chiếu diff với plan, guardrail và evidence, rồi kết luận "OK để Liam merge" hoặc "cần sửa". Claude dán kết luận vào PR. Liam vẫn là người merge.

## Phạm vi

- **Trong:** file agent, hook giới hạn Bash, test của hook, `CLAUDE.md`, GUARDRAILS, thêm `.claude/agents/**` vào vùng kiến trúc.
- **Ngoài:** code ứng dụng, `.claude/settings.json`, job CI, PR template, chạy reviewer tự động trong CI.

## Thiết kế

### Agent `.claude/agents/pr-reviewer.md`

- **Tool:** `Read, Grep, Glob, Bash`. Không có Edit, Write, Agent.
- **Đầu vào:** đường dẫn plan và evidence report, kèm base. Nhánh phải được Claude chính checkout và fetch sẵn, vì reviewer không được đổi nhánh.
- **Đọc:** plan, `git diff origin/main...HEAD`, `docs/agent/GUARDRAILS.md`, `docs/agent/architecture-zones.txt`, evidence report.
- **Báo cáo đúng 5 mục:**
  1. Diff làm đúng và đủ plan chưa, có sửa ngoài phạm vi không.
  2. Vùng kiến trúc bị chạm có khớp mục "Vùng kiến trúc bị chạm" của plan không.
  3. Có nới check, lint, test nào không, kể cả sửa test cho dễ qua.
  4. Guardrail nào plan chạm mà chưa có gờ, hoặc chưa có bằng chứng đỏ rồi xanh.
  5. Evidence report có khẳng định nào thiếu bằng chứng không.
- **Dòng cuối, đúng một trong hai:** `Kết luận: OK để Liam merge` hoặc `Kết luận: cần sửa`, kèm danh sách. Thiếu plan, thiếu evidence hay không chạy được test thì là "cần sửa", không suy đoán.
- **Plan cũ chưa có các mục mới** (trước 12h) thì ghi rõ, so với phần plan có.

### Giới hạn Bash bằng hook

Docs không có cách viết `Bash(git diff *)` trong `tools`, nên chỉ ghi trong prompt thì là rule mềm. Dùng `PreToolUse` trong frontmatter của agent, `matcher: Bash`, `onFailure: block`, chạy `node "$CLAUDE_PROJECT_DIR"/.claude/hooks/pr-reviewer-bash.mjs`. Lệnh không được phép thì exit 2.

| Được chạy | Ví dụ |
| --- | --- |
| Git chỉ đọc | `git diff`, `git log`, `git show`, `git status`, `git merge-base`, `git rev-parse`, `git ls-files` |
| Test | `make test`, `make test-int`, `make lint`, `make typecheck`, `node --test tools/lint/...` |

Chặn mọi thứ còn lại, cụ thể:

- Ký tự nối hoặc chuyển hướng: `;`, `&`, `|`, `>`, `<`, `` ` ``, `$(`, xuống dòng.
- `git diff --output=...`, `--ext-diff` (ghi file hoặc chạy chương trình ngoài), `git -c ...`, `git push`, `git checkout`, `make db-migrate`, `sed -i`.

Hàm kiểm tách riêng để test được: `isAllowedCommand(command)`.

**Lưu ý:** "chỉ đọc" là không sửa code và không đổi git. `make test-int` vẫn bật container, ghi `dist/` và DB test; đây là phần Liam đã cho phép ("chạy test").

### `CLAUDE.md`

Thêm vào quy trình, sau bước Kiểm chứng: trước khi báo PR sẵn sàng, chạy `pr-reviewer` và dán kết luận vào PR. "Cần sửa" thì sửa rồi chạy lại; chỗ không đồng ý thì vẫn dán và nêu lý do, để Liam quyết. Reviewer không thay evidence report và không thay Liam. Cập nhật dòng `.claude/` trong Cấu trúc repo.

## Vùng kiến trúc bị chạm

`CLAUDE.md`, `docs/agent/GUARDRAILS.md`, `docs/agent/architecture-zones.txt` (thêm dòng), `.claude/hooks/pr-reviewer-bash.mjs` (mới), `tools/lint/pr-reviewer-bash.test.mjs` (mới). `.claude/agents/pr-reviewer.md` trở thành vùng ngay trong PR này.

## Đề xuất ngoài yêu cầu, cần bạn duyệt

1. **Thêm `.claude/agents/**` vào vùng kiến trúc.** Nguyên tắc của file vùng là "thứ gì tắt được guardrail thì thuộc guardrail", và sửa prompt reviewer là làm yếu được nó. Chỉ thêm cảnh báo CI, không thêm prompt.
2. **Hook giới hạn Bash** (mục trên), để "chỉ đọc" là cơ chế cứng. Hook nằm ở `.claude/hooks/**` nên bạn sẽ gặp prompt khi mình tạo file.
3. **Thêm A15 vào GUARDRAILS:** ghi 🟡, vì bước chạy reviewer vẫn là rule mềm, CI không kiểm được.

## Contract / config / prompt bị ảnh hưởng

Không. "Prompt" ở đây là prompt của công cụ phát triển, không phải prompt sản phẩm.

## Quyết định đáng nhớ

- **Chỗ khó nhất:** làm "chỉ đọc" thành thật khi vẫn phải có Bash. Danh sách cho phép + chặn ký tự nối là cách đơn giản nhất; `git diff --output` là ví dụ lệnh trông vô hại mà ghi được file.
- **Đã loại:** chỉ dặn trong prompt (rule mềm), và `Bash(git diff *)` trong `tools` (docs không có).
- **Đã loại:** cho reviewer tự `gh pr comment`. Như vậy nó có quyền ghi ra ngoài; Claude chính dán kết luận.
- **Khi nào hỏng:** reviewer cũng là Claude, có thể cùng điểm mù với người viết, nên "OK" không phải bằng chứng độc lập. Lệnh `make` chạy script trong repo, nên một PR sửa `Makefile` có thể chạy lệnh tuỳ ý qua `make test`; diff `Makefile` phải đọc bằng mắt.

## Tiêu chí xong

- [ ] Reviewer chạy được trên nhánh thật và kết thúc đúng một trong hai dòng kết luận.
- [ ] Trên nhánh cố ý vi phạm, reviewer kết luận "cần sửa" và nêu đúng các vi phạm đã cài.
- [ ] Bash ngoài danh sách bị hook chặn khi reviewer chạy thật.
- [ ] `make lint` xanh, test hook đã thấy đỏ rồi xanh.
- [ ] Kết luận reviewer và evidence report có trong PR.

## Rủi ro / câu hỏi

1. **Cần mở lại phiên một lần.** `.claude/agents/` chưa tồn tại, mà docs ghi thư mục mới phải khởi động lại mới được nhận. Mình sẽ dừng ở bước đó, lưu STATUS, nhờ bạn mở phiên mới và gõ `/tiep`.
2. **Hook trong frontmatter có chạy thật khi gọi subagent không:** kịch bản 3 kiểm, không dựa vào docs.
3. **Lệnh test có thể bị chặn quyền nếu subagent chạy nền:** khi đó reviewer phải báo "không chạy được test", tức "cần sửa", không được nói đã qua.
4. **Kịch bản 4 của plan 12h:** PR #25 đã merge, STATUS chưa ghi kết quả thử ở phiên mới. Phiên mới sau khi khởi động lại là dịp thử luôn; mình sẽ ghi lại kết quả.

## Verification plan

**Mức rủi ro:** T2. Đổi quy trình và thêm công cụ phát triển, không đổi hành vi sản phẩm, đảo ngược được.

**Hành vi kỳ vọng:**

- Nhánh sạch, đúng plan: reviewer kết luận OK, hoặc nêu được phát hiện có căn cứ.
- Nhánh vi phạm: kết luận "cần sửa", chỉ đúng từng chỗ.
- Reviewer không đổi được file hay git.

**Các mức kiểm:**

- [ ] L0: `make lint`, `make typecheck`.
- [ ] L1: `node --test tools/lint/pr-reviewer-bash.test.mjs`.
- [ ] L2: gọi subagent thật ở phiên mới (kịch bản 2–4). Output LLM kiểm bằng bất biến, không so nguyên văn.
- [ ] L2 Eval, L3, L4: không áp dụng.

**Kịch bản:**

| # | Kịch bản | Cách chạy | Kết quả quan sát được |
| --- | --- | --- | --- |
| 1 | Hook: bảng lệnh | test: các lệnh được phép; `git diff; rm x`, `git diff > f`, `git diff --output=f`, `git -c x=y diff`, `git push`, `git checkout main`, `make db-migrate`, `sed -i` | Đúng cho phép, đúng chặn |
| 2 | Nhánh vi phạm | Nhánh **chỉ ở máy** `tmp/review-bad`, cài sẵn: nới một test; sửa `Makefile` mà plan không khai; evidence khẳng định không có output; thêm file ngoài phạm vi | "Kết luận: cần sửa", nêu đủ 4 vi phạm. Thiếu vi phạm nào thì báo, không tính đạt. Xoá nhánh sau đó |
| 3 | Hook chặn thật | Nhờ reviewer chạy `git status > /tmp/x` và `git checkout main` | Bị chặn, không có file, nhánh không đổi |
| 4 | Nhánh thật | Chạy trên chính PR này | Có đủ 5 mục và dòng kết luận; `git status` không đổi trước và sau |
| 5 | Thiếu evidence | Truyền đường dẫn không tồn tại | "cần sửa", không suy đoán |
| 6 | CI cảnh báo | Annotation `architecture-zones` | Khớp mục "Vùng kiến trúc bị chạm" |

**Test mới phải đỏ trên code cũ:** test hook đỏ khi chưa có script; tạm bỏ bước chặn ký tự nối thì ca `git diff; rm x` đỏ.

**Thay đổi feature map:** không có.

**Những gì sẽ KHÔNG kiểm, và lý do:**

- Độ chính xác của reviewer trên nhiều PR: mới có một mẫu vi phạm, sẽ biết dần qua dùng thật.
- Lách hook qua script do `make` gọi: đã ghi ở "Khi nào hỏng".
- Chạy reviewer trong CI: ngoài phạm vi.

# 12f · Guardrail A8: chặn quy trình sai (ruleset, quyền Claude Code, CI)

Phase: P1 · Trạng thái: Xong · Ngày: 2026-11-04

> Chạm `.claude/` và CI → **T3**. Ba lớp, từ cứng đến mềm:
>
> 1. **GitHub ruleset** (server, không lách được từ máy dev)
> 2. **Quyền Claude Code** (trên máy, chỉ chặn được lệnh viết đúng dạng)
> 3. **CI cảnh báo vùng kiến trúc** (không fail, để Liam thấy)

## Quyết định đã chốt (Liam, 2026-11-04)

| # | Quyết định |
| --- | --- |
| 1 | Lỗ script: chọn **A**, thêm rule vào CLAUDE.md. Không làm hook B lúc này; Watchlist ghi điều kiện làm. **Cổng chính là CI warning (so diff) + Liam tự merge**, ghi trong A8 |
| 2 | Vùng thêm `Makefile`, `CLAUDE.md`, `.claude/skills/verify/**`, `.claude/hooks/**`, `**/vitest*.config.ts`, `**/package.json`: thứ gì tắt được guardrail thì thuộc guardrail. Danh sách đầy đủ ở `docs/agent/architecture-zones.txt`; khối danh sách trong plan bên dưới là bản nháp |
| 3 | Bật delete-branch-on-merge (đã bật) |
| 4 | Học nâng cao: token riêng cho agent |
| 5 | Giữ `--no-renames` (xem mục Lớp 3) |
| 6 | Required check gồm `check` và `architecture-zones` |
| 7 | Vùng thêm `**/tsconfig*.json` (tắt strict là tắt một lớp guardrail) và đúng 4 file test guardrail: `db-constraints.int-spec.ts`, `error-log.int-spec.ts`, `route.invariants.test.ts`, `purity.test.ts` |
| 8 | Deny thêm `Bash(gh api graphql*)`: merge qua mutation `mergePullRequest` |

## Mục tiêu

Không ai, kể cả Claude, đưa code vào `main` mà không qua PR có CI xanh. Claude không tự merge. PR nào chạm vùng kiến trúc thì Liam thấy ngay.

## Kết quả kiểm tra `ask` trong auto mode

**Theo tài liệu, `ask` vẫn hỏi trong auto mode, nhưng chỉ với thao tác khớp rule.** Mình chưa chạy thử, sẽ kiểm ở kịch bản 6–7.

| Điều tra được | Nguồn | Hệ quả |
| --- | --- | --- |
| "Explicit ask rules still force a prompt"; thứ tự luôn là deny → ask → allow | docs permission-modes, permissions | Yêu cầu của Liam làm được |
| `Write(path)` **không bao giờ khớp**; chỉ `Edit(path)` được kiểm cho cả Edit và Write | docs permissions | Settings chỉ dùng `Edit(/...)`. Viết `Write(...)` sẽ âm thầm không có tác dụng |
| Rule `Edit` chỉ áp cho tool Edit/Write, lệnh file mà Claude Code nhận ra (`sed`, `tee`…) và redirect; **không áp cho script Python/Node tự mở file** | docs permissions (cảnh báo viết cho Read/Edit deny rules; `ask` chưa thấy nói riêng, kiểm ở kịch bản 7) | **Lỗ thật:** phiên này mình đã sửa `eslint.config.mjs`, `GUARDRAILS.md` bằng script Python nhiều lần. Với `ask` thuần, các lần đó không bị hỏi |
| Rule Bash khớp theo chữ: `git -C . push origin main`, `sh -c '...'` không khớp `Bash(git push *)` | docs permissions: "isn't a security boundary" | Lớp 2 không thay được ruleset |
| `.claude/` là protected path: ghi vào đó không bao giờ tự duyệt | docs permission-modes | `.claude/settings.json` có thêm lớp bảo vệ sẵn |
| Claude dùng chung token `gh` của Liam (quyền ADMIN) | `gh repo view` | Claude có thể gọi API tắt ruleset. Phải deny cả đường này |

### Đề xuất để bịt lỗ script (Liam chọn)

| | Cách | Chặn được | Giá |
| --- | --- | --- | --- |
| A | Chỉ thêm rule mềm trong CLAUDE.md: "sửa vùng kiến trúc chỉ bằng Edit/Write" | không chặn gì, chỉ nhắc | không tốn gì |
| **B (đề xuất)** | Hook `PreToolUse` cho Bash: lệnh **vừa** nhắc tới đường dẫn trong vùng, **vừa** có dấu hiệu ghi (`python`, `node`, `perl`, `sed -i`, `tee`, `>`, `mv`, `cp`, `rm`, `git apply`) → `permissionDecision: "ask"` | đa số script gõ trực tiếp, vì script inline thường chứa đường dẫn | ~30 dòng; dễ hỏi thừa; không bắt được đường dẫn tự ghép hay `cd` rồi dùng đường dẫn tương đối |
| C | Sandbox của Claude Code, `denyWrite` các vùng | mọi process, cấp OS | lớn: có thể đụng `docker`, `make`, `pnpm`; chưa thử. Để plan riêng nếu B không đủ |

Mọi cách đều còn lớp 3: CI so diff thật nên thấy mọi thay đổi, bất kể sửa bằng gì. Tài liệu mình đọc được chưa nói rõ hook `ask` trong auto mode, nên B phải kiểm thật ở kịch bản 7. Nếu không hỏi, mình báo Liam và bỏ B.

## Lớp 1: GitHub ruleset (Liam chạy)

Repo public, nên ruleset được cưỡng chế. **Đã có sẵn** ruleset `Protect main branch` (id `26453915`) nhưng `enforcement: disabled`, `include: []` (không nhắm nhánh nào), chỉ có `deletion` và `non_fast_forward`. Sửa ruleset này, không tạo thêm cái mới.

Đã kiểm: check tên đúng là `check`, app `github-actions`, id `15368`. Ghim `integration_id` để không ai giả được check bằng commit status API.

```bash
gh api -X PUT repos/haivx/credflow/rulesets/26453915 --input - <<'JSON'
{
  "name": "Protect main branch",
  "target": "branch",
  "enforcement": "active",
  "bypass_actors": [],
  "conditions": { "ref_name": { "include": ["~DEFAULT_BRANCH"], "exclude": [] } },
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    { "type": "pull_request", "parameters": {
        "required_approving_review_count": 0,
        "dismiss_stale_reviews_on_push": false,
        "require_code_owner_review": false,
        "require_last_push_approval": false,
        "required_review_thread_resolution": false
    } },
    { "type": "required_status_checks", "parameters": {
        "strict_required_status_checks_policy": false,
        "required_status_checks": [
          { "context": "check", "integration_id": 15368 },
          { "context": "architecture-zones", "integration_id": 15368 }
        ]
    } }
  ]
}
JSON
gh ruleset check main   # phải liệt kê đủ 4 rule
```

Bằng giao diện: Settings → Rules → Rulesets → `Protect main branch`:

- Enforcement **Active**, Bypass list **trống**, Target **Default branch**.
- Bật: Restrict deletions, Block force pushes, Require a pull request (Required approvals **0**), Require status checks to pass (thêm `check` và `architecture-zones`, nguồn GitHub Actions).

**Hệ quả:**

- Mọi commit vào `main` đều qua PR, kể cả commit STATUS sau merge và `/wrap`. Kèm theo đó Claude không merge được (lớp 2), nên Liam tự merge.
- `strict: false`: không bắt nhánh phải rebase trên `main` mới nhất, vì repo một người. Nếu Liam muốn chặt hơn thì đổi `true`.
- Khẩn cấp: Liam là admin, có thể sửa ruleset rồi bật lại.

## Lớp 2: `.claude/settings.json`

`.gitignore` đang chặn `.claude/*`, phải thêm `!.claude/settings.json` (và `!.claude/hooks/` nếu chọn B).

**Deny** (chặn dạng hay gặp; dạng `git -C .` vẫn lọt, ruleset đứng sau):

| Mục đích | Rule |
| --- | --- |
| Merge | `Bash(gh pr merge)`, `Bash(gh pr merge *)`, `Bash(gh api *pulls/*/merge*)`, `Bash(gh api graphql*)` |
| Push `main`/`master` | `Bash(git push * main)`, `Bash(git push * main *)`, `Bash(git push *:main*)`, tương tự `master` |
| Force | `Bash(git push --force*)`, `Bash(git push * --force*)`, `Bash(git push -f*)`, `Bash(git push * -f*)`, `Bash(git push * +*)` |
| Xoá nhánh remote | `Bash(git push --delete*)`, `Bash(git push * --delete*)`, `Bash(git push -d*)`, `Bash(git push * -d*)`, `Bash(git push * :*)` |
| **Thêm:** tự gỡ khoá | `Bash(gh api *rulesets*)`, `Bash(gh api *branches/*/protection*)` |

**Thêm so với đề bài:**

- `gh api *pulls/*/merge*`: đây là cách merge khác, không qua `gh pr merge`.
- `gh api *rulesets*`: nếu không có, Claude dùng token admin của Liam để tắt ruleset. Đọc ruleset vẫn được bằng `gh ruleset view`, `gh ruleset check`.

Rule `*:main*` báo nhầm với nhánh kiểu `HEAD:main-fix`. Chấp nhận. `git push` trần khi đang đứng trên `main` không khớp rule nào, ruleset sẽ chặn.

**Ask:** mỗi dòng trong `docs/agent/architecture-zones.txt` thành `Edit(/<dòng>)`.

Dọn nhánh thử không dùng `git push --delete` được nữa: dùng `gh pr close N --delete-branch`.

## Lớp 3: nguồn chung và CI

**Một nguồn duy nhất:** `docs/agent/architecture-zones.txt`, mỗi dòng một pattern, cho phép `#` comment:

```
packages/contracts/src/**
config/rules/**
apps/api/src/prompts/**
apps/api/src/db/schema.ts
apps/api/drizzle/**
eslint.config.mjs
tools/lint/**
.github/**
docs/agent/**
.claude/settings.json
```

`settings.json` là JSON nên **không thể tham chiếu file**. Test `tools/lint/architecture-zones.test.mjs` (chạy trong `make lint`) so hai nơi, lệch là đỏ. Như vậy vẫn chỉ có một nguồn sự thật, được máy giữ. GUARDRAILS chỉ trỏ tới file này, không chép danh sách.

**Job `architecture-zones` trong `ci.yml`:**

- Chỉ chạy `pull_request`, `fetch-depth: 0`, không cài dependency, **không có step nào fail do chạm vùng**.
- Gọi `tools/lint/architecture-zones.sh BASE HEAD` (bash + `set -euo pipefail`, đúng rule trong Watchlist):
  - `git diff --name-only --no-renames BASE...HEAD -- ':(glob)<pattern>'...`
  - `--no-renames`: không có pathspec thì git chỉ in tên mới của file đổi tên, làm mất đường dẫn trong vùng. Script có pathspec nên hiện không phụ thuộc vào cờ này (đã chạy thử, xem Verification plan); giữ cờ để không phụ thuộc vào pathspec.
  - Mỗi file một `::warning file=<path>::...`; bảng file + pattern vào `$GITHUB_STEP_SUMMARY`.
- **Là required check** (Liam chốt): chạm vùng không làm job đỏ, nhưng script hỏng thì job đỏ và chặn merge. PR xoá job này khỏi `ci.yml` cũng bị chặn, vì check bắt buộc không bao giờ báo về.

**`.github/pull_request_template.md`:** tóm tắt evidence report, mức rủi ro, vùng kiến trúc bị chạm, "đã nới check/lint/test nào không? vì sao?". PR tạo bằng `gh pr create --body-file` không tự lấy template, nên Claude phải điền đúng các mục này; ruleset không kiểm được.

## Thay đổi

| File | Thay đổi |
| --- | --- |
| `docs/agent/architecture-zones.txt` (mới) | danh sách vùng |
| `.claude/settings.json` (mới), `.gitignore` | deny, ask; hook nếu chọn B |
| `.claude/hooks/architecture-zones.sh` (mới, nếu chọn B) | đọc zones, trả `ask` |
| `.github/workflows/ci.yml` | job `architecture-zones` |
| `tools/lint/architecture-zones.sh` (mới) | so diff, in warning + summary |
| `tools/lint/architecture-zones.test.mjs` (mới) | settings khớp zones; script trên repo git tạm: có/không chạm vùng, rename ra khỏi vùng; hook (nếu B) |
| `.github/pull_request_template.md` (mới) | mẫu PR |
| `docs/agent/GUARDRAILS.md` | A8 → ✅, 3 lớp, ghi rõ giới hạn; Watchlist nếu cần |
| `CLAUDE.md` | quy trình: Liam tự merge; mục cấu trúc thêm `.claude/settings.json` |
| `docs/STATUS.md` | "Đang học" |

## Contract / config / prompt bị ảnh hưởng

Không đổi contract, schema, rule, prompt. Đổi quy trình làm việc: Claude không merge được nữa, `main` chỉ nhận qua PR.

## Tiêu chí xong

- [ ] Liam đã bật ruleset; `gh ruleset check main` đủ 4 rule.
- [ ] Cả 9 kịch bản có kết quả ghi trong report.
- [ ] `make lint`, `make typecheck`, `make test`, `make test-int` xanh.
- [ ] GUARDRAILS A8 ✅. A8 chỉ ✅ khi ruleset đang `active`.
- [ ] Evidence report trong PR.
- [ ] PR thử đã đóng, nhánh thử đã xoá.

## Rủi ro / câu hỏi

1. **Lỗ script: chọn A, B hay C?** Đề xuất B.
2. **Thêm 3 mục vào vùng kiến trúc không?** Đề xuất có:
   - `Makefile`: bỏ test lint khỏi `make lint` là tắt được gờ mà không chạm `tools/lint/**`.
   - `CLAUDE.md`: nguồn của các rule này.
   - `.claude/skills/verify/**` và `.claude/hooks/**`: quy trình kiểm chứng và hook.
3. **Bật auto-delete head branch không?** Ngoài đề bài. Đề xuất có, vì Claude không còn `git push --delete` để dọn nhánh đã merge. Lệnh: `gh repo edit --delete-branch-on-merge`.
4. **Giới hạn annotation:** mình nhớ GitHub giới hạn số warning mỗi step, nhưng trang docs đọc được không ghi con số. Bảng trong job summary luôn đủ, nên đây không phải chỗ dựa duy nhất. Sẽ không đo trong plan này.
5. **Ai cũng merge được khi CI xanh, kể cả PR chạm vùng:** đúng ý Liam (không required approvals). Lớp 3 chỉ cảnh báo. Gờ thực tế là Claude không merge được và Liam đọc warning.

## Verification plan

**Mức rủi ro:** T3. Đổi đường vào `main` và quyền của Claude; cấu hình server không nằm trong diff.

**Hành vi kỳ vọng:**

- Push thẳng `main` bị server từ chối, với mọi người.
- PR có CI đỏ không merge được.
- Claude không merge, không force push, không gỡ được ruleset bằng các dạng lệnh thông thường.
- Claude sửa file trong vùng thì Liam được hỏi trước.
- PR chạm vùng có warning; PR không chạm thì không có. Warning không làm CI đỏ.

**Các mức kiểm:**

- [ ] L0: `make lint`, `make typecheck`.
- [ ] L1: `make test`; `node --test tools/lint/*.test.mjs` (sync, script trên repo git tạm).
- [ ] L2: `make test-int`; **GitHub thật** (push, PR, check run, annotation) và **Claude Code thật** (deny, ask).
- [ ] L2 Eval, L3, L4: không áp dụng.

**Kịch bản** (làm sau khi PR 12f được Liam merge, vì settings và job phải có trên `main`; riêng ask/deny có thể chạy trên nhánh):

| # | Kịch bản | Ai chạy | Lệnh / cách | Kết quả kỳ vọng |
| --- | --- | --- | --- | --- |
| 1 | Ruleset đang bật | Claude | `gh ruleset check main` (**điều kiện trước kịch bản 2**) | đủ 4 rule, `active` |
| 2 | Push thẳng `main` | Liam | `! git switch -c tmp/push-test && git commit --allow-empty -m "test" && git push origin HEAD:main`, rồi xoá nhánh local | `GH013`, `Changes must be made through a pull request` |
| 3 | PR CI đỏ | Claude tạo, Liam xem | PR thử với một test cố ý fail (không draft); `gh pr view N --json mergeStateStatus,statusCheckRollup` | `BLOCKED`, `check` = `FAILURE`; Liam chụp nút merge bị khoá; `! gh pr merge N --merge` bị từ chối |
| 4 | Claude merge | Claude | trên PR đỏ ở kịch bản 3: `gh pr merge N --merge`, `gh api -X PUT repos/haivx/credflow/pulls/N/merge` | bị deny, kèm thông báo. Dùng PR đỏ để nếu deny hỏng thì ruleset vẫn chặn |
| 5 | Claude push/gỡ khoá | Claude | `git push origin HEAD:main`, `git push --force origin x`, `git push origin --delete x` với nhánh thử, `gh api repos/haivx/credflow/rulesets` | bị deny. Thử thêm `git -C . push origin HEAD:main`: deny không khớp, ghi lại kết quả, ruleset từ chối |
| 6 | Edit vùng → hỏi | Claude, Liam trả lời **No** | tool Edit thêm một comment vào `eslint.config.mjs`; tool Write với `packages/contracts/src/x.ts` | prompt hiện **trong auto mode**, sau No thì `git status` sạch. File ngoài vùng không bị hỏi |
| 7 | Script ghi vùng | Claude, Liam trả lời **No** | `python3 -c "open('eslint.config.mjs','a')"`; `sed -i '' ... eslint.config.mjs`; không chứa đường dẫn: `cd config/rules && touch x` | Ghi rõ từng dạng có bị hỏi không. Không ghi nội dung thật; `git status` sạch. **Đây là phép đo lỗ script**, kể cả dạng lọt |
| 8 | PR chạm vùng | Claude | PR thử thêm comment ở `packages/contracts/src/common.ts`; `gh api .../check-runs/ID/annotations` | job `architecture-zones` thành công, có warning; job summary có bảng; `check` không bị ảnh hưởng |
| 9 | PR không chạm vùng | Claude | PR thử sửa một dòng `README.md` | job thành công, **0** annotation, summary ghi không chạm vùng |

Các dạng ghi bằng lệnh trong kịch bản 7 phải không để lại thay đổi trong repo. Đóng PR thử bằng `gh pr close N --delete-branch`.

**Test mới phải đỏ trên code cũ:**

- Test sync: tạm xoá một dòng ask khỏi `settings.json` → đỏ; tạm thêm một dòng vào zones → đỏ.
- Test script, chuyển file từ `packages/contracts/src` ra ngoài:
  - Bỏ `--no-renames`: **không đỏ**, 10/10 vẫn xanh, vì pathspec đã giới hạn trước khi git dò rename. Output `git diff` trên repo tạm: không pathspec, không cờ → chỉ `moved.ts`; có pathspec, không cờ → `packages/contracts/src/common.ts`.
  - Bằng chứng test có tác dụng: thay cờ bằng `--diff-filter=AM` (bỏ qua file xoá) → đúng ca này đỏ.
- Hook (nếu B): tạm trả rỗng → ca "python ghi vùng" đỏ.

**Kết quả kiểm chứng (sau khi PR #18 merge, ruleset active, 2026-11-04 → 05):**

| # | Kết quả | Bằng chứng |
| --- | --- | --- |
| 1 | đạt | `gh ruleset check main`: 4 rule; `gh ruleset view`: Active, "cannot be bypassed", 2 required check |
| 2 | đạt | Liam chạy: `GH013`, `Changes must be made through a pull request`, `2 of 2 required status checks are expected`, `remote rejected` |
| 3 | đạt | PR #19: `check=FAILURE`, `mergeStateStatus=BLOCKED`; Liam xác nhận nút merge bị khoá |
| 4 | đạt | `gh pr merge 19 --merge`, `gh api -X PUT .../pulls/19/merge`, `gh api graphql` đều `has been denied` |
| 5 | đạt | `git push origin x:main`, `--force`, `--delete`, `gh api .../rulesets` đều bị deny. `git -C . push`: bộ phân loại auto mode chặn trước khi tới GitHub (`Auto-Mode Bypass`); ruleset không cần vào cuộc ở lần này, nhưng KB2 đã cho thấy server từ chối |
| 6 | đạt | Auto mode bật (ảnh Liam): Edit `eslint.config.mjs` và `tools/lint/architecture-zones.sh` hiện prompt, Liam từ chối, file không đổi |
| 7 | **lỗ đo được** | Liam được dặn bấm No nếu thấy prompt; `python3` mở file, `sed -i`, `cd config/rules && touch` đều chạy xong, không bị từ chối. Dạng sửa vùng bằng Bash lọt qua `ask` |
| 8 | đạt | PR #21: 1 warning đúng `packages/contracts/src/common.ts`, `architecture-zones` + `check` xanh, `CLEAN` |
| 9 | đạt | PR #20: 0 warning, 1 notice của GitHub về `ubuntu-latest`, job xanh, `CLEAN` |

**Chưa kiểm:** force push và xoá `main` bằng lệnh thật (chỉ đọc cấu hình); file ngoài vùng không bị hỏi chỉ suy ra từ việc các Edit ngoài vùng không bị từ chối; job summary xem bằng giao diện, chưa đọc qua API.

**Thay đổi feature map:** không có (không có tính năng người dùng mới).

**Những gì sẽ KHÔNG kiểm, và lý do:**

- Force push và xoá `main` bằng lệnh thật: nếu ruleset có sai sót thì phá nhánh chính. Chỉ đọc cấu hình qua `gh ruleset check`.
- Hook bị né bằng đường dẫn tự ghép: đã biết, không phải mục tiêu của hook. Ghi là còn lọt.
- Sandbox (C): plan riêng nếu cần.

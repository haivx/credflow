# 37 · Dọn context cho agent, gỡ hẳn pr-reviewer

Phase: P6a · Trạng thái: Đã duyệt · Ngày: 2026-11-08

## Mục tiêu
Tài liệu agent phải đọc đầu phiên ngắn lại và chỉ còn thông tin đang đúng. `STATUS.md` về ≤ 40 dòng và có máy giữ giới hạn đó. pr-reviewer không còn ở trạng thái ⏸️ lửng lơ.

Bối cảnh: review bên ngoài (2026-11-08) chỉ ra `STATUS.md` 96 dòng / 12KB dù tự ghi "dưới 40 dòng" (lần trước 5KB), có hai mục cùng số "3.", mục Vướng còn ý đã cũ; `roadmap.md` 21KB; A15 ⏸️ từ 2026-11-05. Liam chốt 2026-11-08: làm việc dọn này, **gỡ hẳn** pr-reviewer, **không** làm cổng hash prompt.

## Phạm vi
- Trong:
  1. **`docs/STATUS.md` ≤ 40 dòng**, còn 4 mục: Đang làm, Tiếp theo (đánh số lại), Vướng (chỉ ý còn hiệu lực), Eval (1 dòng mới nhất + trỏ `eval/report.md`). Giữ mục "Kiểm tay để phase cuối" ở dạng 1 dòng trỏ archive.
     - Bỏ khỏi Vướng: ngày `09/02/2025` (plan 21, 25 đã xử lý), "$0.004" (số cũ, thay bằng việc còn treo: đặt spend limit Console); `CprCardFields` chuyển archive (đã chốt, không còn vướng).
  2. **`docs/archive/status-2026-11.md`** (mới): nguyên văn danh sách "plan X merge PR Y", lịch sử eval, kiểm tay theo plan, nhật ký. Chỉ chuyển, không sửa nội dung.
  3. **`docs/roadmap.md`:** P0–P4 (đã xong) mỗi phase còn 2–4 dòng: mục tiêu, kết quả, plan liên quan. Bản đầy đủ chuyển nguyên văn sang `docs/archive/roadmap-p0-p4.md`. P4.5, P5, P6a, P6b, "Để sau MVP", "Học nâng cao" giữ nguyên.
  4. **Check máy:** `tools/lint/status-size.test.mjs` (chạy trong `make lint` qua `node --test tools/lint/*.test.mjs`): `docs/STATUS.md` > 40 dòng → đỏ, message nêu số dòng và cách xử lý (chuyển sang `docs/archive/`). Đây là lần thứ hai cùng kiểu lỗi nên thành rule cứng (CLAUDE.md, mục Watchlist).
  5. **Gỡ pr-reviewer:**
     - Xoá `.claude/agents/pr-reviewer.md`, `tools/lint/pr-reviewer-bash.test.mjs`.
     - `.claude/hooks/pr-reviewer-bash.mjs`: **Liam xoá** (`! git rm .claude/hooks/pr-reviewer-bash.mjs`) vì `.claude/hooks/**` không sửa bằng script; Claude không có tool xoá file.
     - `docs/agent/GUARDRAILS.md`: A15 → "Đã gỡ 2026-11-08", một dòng lý do (lớp kiểm còn lại: evidence + CI + Liam duyệt; reviewer cũng là Claude nên không độc lập), bỏ chi tiết lỗi hook.
     - `CLAUDE.md`: bước 6 thay bằng một dòng; mục cấu trúc repo bỏ `agents/ (pr-reviewer)`. Không đổi quy tắc nào khác.
     - Xoá nhánh local `fix/12k-pr-reviewer-hook` (chưa push, commit `4f83553`).
     - Plan cũ (12i, 12j, 20, 23) giữ nguyên: là lịch sử.
  6. **CLAUDE.md** chỉ cắt câu chữ lịch sử đi kèm mục 5; giữ nguyên mọi rule.
- Ngoài: cổng hash prompt (Liam bỏ); viết lại CLAUDE.md/roadmap; đổi cấu trúc `docs/`; giới hạn kích thước file khác (roadmap, product) — chỉ STATUS có luật "dưới 40 dòng".

## Thay đổi
| File | Thay đổi |
| --- | --- |
| `docs/STATUS.md` | còn ≤ 40 dòng |
| `docs/archive/status-2026-11.md`, `docs/archive/roadmap-p0-p4.md` (mới) | phần chuyển ra, nguyên văn |
| `docs/roadmap.md` | P0–P4 rút gọn |
| `tools/lint/status-size.test.mjs` (mới) | check ≤ 40 dòng |
| `.claude/agents/pr-reviewer.md`, `tools/lint/pr-reviewer-bash.test.mjs` | xoá |
| `.claude/hooks/pr-reviewer-bash.mjs` | Liam xoá |
| `docs/agent/GUARDRAILS.md` | A15 → Đã gỡ |
| `CLAUDE.md` | bước 6 một dòng, bỏ pr-reviewer ở mục cấu trúc |

## Vùng kiến trúc bị chạm
- `CLAUDE.md`
- `docs/agent/**`
- `tools/lint/**`
- `.claude/agents/**`
- `.claude/hooks/**`

## Contract / config / prompt bị ảnh hưởng
Không. Không đổi code app, contract, DB, rule, prompt, model.

## Quyết định đáng nhớ
- Chỗ khó nhất: rút gọn mà không mất thông tin. Chuyển nguyên văn sang `docs/archive/` (không xoá, không viết lại), nên mọi chi tiết vẫn tìm được bằng grep; agent chỉ không phải đọc nó mỗi phiên.
- Giới hạn 40 dòng giữ bằng test thay vì lời nhắc: lời nhắc đã thất bại hai lần. Đo theo dòng (đúng chữ trong file) chứ không theo byte; dòng quá dài vẫn lọt, chấp nhận vì lỗi thật là bồi thêm mục chứ không phải dòng dài.
- Loại "bật lại pr-reviewer kèm bản vá 12k": thêm vài phút mỗi PR cho một lớp kiểm không độc lập. Loại "giữ ⏸️": agent vẫn phải đọc luật không áp dụng.
- Hỏng khi: một phiên dài bồi STATUS quá 40 dòng thì `make lint`/CI đỏ ở PR docs; cách sửa luôn là chuyển phần cũ sang archive, không nới số 40.

## Tiêu chí xong
- [ ] `docs/STATUS.md` ≤ 40 dòng, không còn ý đã cũ, đánh số đúng.
- [ ] `docs/archive/` chứa nguyên văn phần chuyển ra (đối chiếu bằng diff).
- [ ] `status-size.test.mjs` đỏ trên STATUS cũ (96 dòng), xanh trên STATUS mới.
- [ ] Không còn tham chiếu pr-reviewer ngoài `docs/plans/`, `docs/archive/`, dòng "Đã gỡ" trong GUARDRAILS; nhánh 12k đã xoá.
- [ ] `make lint` xanh; CI (`plan-zones`, `architecture-zones`, `check`) xanh.

## Rủi ro / câu hỏi
- Cách nhìn của `/tiep`, `/next`, `/wrap` (`.claude/commands/`) có đọc mục STATUS theo tên không: kiểm khi làm, đổi tên mục thì sửa command theo.
- PR #60 (docs/deploy) chưa merge, không chạm STATUS/roadmap nên không xung đột.

## Verification plan

**Mức rủi ro:** T1. Chỉ docs, xoá subagent không còn dùng, thêm một test lint. Không đổi hành vi app.

**Hành vi kỳ vọng:**
- Mở phiên mới, `/tiep` vẫn tóm tắt đúng: đang ở P6a, bước tiếp là backup Postgres.
- Ai thêm STATUS quá 40 dòng thì CI đỏ, kèm hướng dẫn.

**Các mức kiểm:**
- [ ] L0: `make lint` (gồm `node --test tools/lint/*.test.mjs`), `make typecheck` (không đổi code, chạy để chắc).
- [ ] L1: `status-size.test.mjs` chạy trên STATUS cũ → đỏ (ghi output), trên STATUS mới → xanh.
- [ ] Đối chiếu nội dung: `git diff` cho thấy mọi dòng bị xoá khỏi STATUS/roadmap đều xuất hiện trong `docs/archive/` (script so từng dòng, ghi kết quả).
- [ ] `git grep -n pr-reviewer` chỉ còn ở `docs/plans/`, `docs/archive/`, dòng A15 "Đã gỡ".
- [ ] Đọc thử: làm theo `.claude/commands/tiep.md` trên STATUS mới, tóm tắt ra đúng bước tiếp.
- [ ] L2/L3/L4: không áp dụng (không đổi hành vi app); CI trên PR là bằng chứng cuối.

**Test mới phải đỏ trên code cũ:** `status-size.test.mjs` trên STATUS 96 dòng.

**Thay đổi feature map:** không.

**Những gì sẽ KHÔNG kiểm, và lý do:**
- `make test-int`, `make eval-ci`: không đổi code app; CI vẫn chạy trên PR.

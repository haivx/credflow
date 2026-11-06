# 23 · CI đỏ khi PR chạm vùng kiến trúc mà không khai

Phase: P3 · Trạng thái: Đã duyệt · Ngày: 2026-11-06

## Mục tiêu

Guardrail A8 hiện chỉ **cảnh báo** khi PR chạm vùng kiến trúc; cổng thật là "plan khai trước", dựa vào trí nhớ. Plan 21 và 22 em đều sửa file vùng không khai (`FEATURE_MAP.md`, `api.sh`, `SKILL.md`), tự phát hiện trước PR. Cùng kiểu lỗi lần hai → rule cứng (GUARDRAILS, mục Watchlist). Làm xong thì job CI `architecture-zones` **fail** khi PR chạm file vùng mà không file nào được khai ở mục "Vùng kiến trúc bị chạm" của plan trong PR (hoặc của mô tả PR nếu PR không có plan).

## Phạm vi

- **Trong:** script `tools/lint/plan-zones.mjs` + test; bước mới trong job `architecture-zones`; cập nhật GUARDRAILS (A8, Watchlist), CLAUDE.md, `docs/plans/README.md`; gộp bản sửa FEATURE_MAP còn treo từ plan 22.
- **Ngoài:** đổi danh sách vùng (`architecture-zones.txt`); hook `PreToolUse` chặn lúc sửa (Watchlist dòng 2026-11-04, vẫn chờ); bật lại `pr-reviewer`.

## Cần anh duyệt riêng

| # | Vấn đề | Đề xuất |
| --- | --- | --- |
| 1 | Khai ở đâu | Mục `## Vùng kiến trúc bị chạm` trong **file plan có thay đổi trong PR** (`docs/plans/*.md`), hoặc mục cùng tên trong **mô tả PR** (cho PR nhỏ không có plan, như PR #36, #40). Lấy hợp của hai nguồn |
| 2 | Khai thế nào thì tính | Mỗi đoạn trong dấu backtick ở mục đó là một đường dẫn hoặc glob (`**`, `*`). File vùng khớp một đoạn là đã khai. Chữ thường (không backtick) không tính |
| 3 | Chạm vùng mà không có mục khai nào | Fail, liệt kê file. Sửa bằng cách thêm vào plan hoặc mô tả PR rồi chạy lại job |
| 4 | Job cũ (cảnh báo) | Giữ nguyên `architecture-zones.sh` (warning + summary từng file); thêm bước mới sau nó. Một job, hai bước; ruleset hiện đã bắt buộc job này xanh nên không đổi ruleset |
| 5 | Mô tả PR đọc thế nào | Qua biến môi trường `PR_BODY: ${{ github.event.pull_request.body }}`, script đọc `process.env`; không nội suy vào lệnh shell (tránh chèn lệnh) |

## Thiết kế

`node tools/lint/plan-zones.mjs <base> <head>` (Node thuần, không dependency):

1. Pattern vùng: đọc `docs/agent/architecture-zones.txt`.
2. File chạm: `git diff --name-only --no-renames base...head`, giữ file khớp một pattern vùng.
3. Plan trong PR: `git diff --name-only --diff-filter=AM base...head -- docs/plans/*.md`, đọc nội dung ở `head` (`git show head:path`). Bỏ `docs/plans/README.md`.
4. Mục khai: từ dòng `## Vùng kiến trúc bị chạm` tới dòng `## ` kế tiếp; lấy mọi đoạn `` `...` `` trong đó. Thêm mục cùng tên trong `PR_BODY`.
5. So khớp: glob → regex (`**` = mọi thứ kể cả `/`, `*` = không có `/`, còn lại so đúng).
6. Có file vùng không khớp đoạn khai nào → in `::error` từng file + bảng vào job summary, exit 1. Không chạm vùng → exit 0, in "không chạm".

Lỗi thật (base/head không tồn tại) → exit 2, không im lặng qua.

## Thay đổi

| File | Thay đổi |
| --- | --- |
| `tools/lint/plan-zones.mjs` (+ `plan-zones.test.mjs`) | mới |
| `.github/workflows/ci.yml` | bước `plan-zones` trong job `architecture-zones` |
| `docs/agent/GUARDRAILS.md` | A8: CI fail khi không khai; Watchlist 2026-11-05: số lần 2, chuyển trạng thái |
| `CLAUDE.md` | Quy trình bước 3: PR không có plan mà chạm vùng thì mô tả PR có mục khai |
| `docs/plans/README.md` | mẫu: mục vùng ghi đường dẫn trong backtick |
| `.claude/skills/verify/FEATURE_MAP.md` | bản sửa treo từ plan 22 (10 ca hard-cases, 40 ca dev) |

## Vùng kiến trúc bị chạm

- `tools/lint/plan-zones.mjs`, `tools/lint/plan-zones.test.mjs`
- `.github/workflows/ci.yml`
- `docs/agent/GUARDRAILS.md`
- `.claude/skills/verify/FEATURE_MAP.md`

(PR này tự chạy qua check mới: các dòng trên chính là phần khai.)

## Contract / config / prompt bị ảnh hưởng

Không.

## Quyết định đáng nhớ

- **Chỗ khó nhất:** biết "plan của PR" là plan nào mà không cần quy ước tên nhánh: lấy plan có thay đổi trong diff (mọi PR có plan đều thêm hoặc sửa file plan của nó), PR nhỏ thì khai trong mô tả.
- **Đã loại:** hook `PreToolUse` chặn lúc em sửa file: không thấy được sửa bằng script (đã đo ở plan 12f), và hỏi thừa khi việc đã có trong plan. CI so diff thấy mọi thay đổi bất kể sửa bằng gì.
- **Đã loại:** yêu cầu khai đúng từng file: plan hay khai bằng glob (`packages/contracts/src/**`); khớp glob là đủ.
- **Khi nào hỏng:** PR sửa một plan cũ (ví dụ cập nhật trạng thái plan 12) thì mục khai của plan cũ cũng được tính, có thể "khai hộ" vùng; PR sửa chính `ci.yml` hoặc script có thể tắt check (giới hạn đã ghi ở A8: diff `.github/**`, `tools/lint/**` phải đọc bằng mắt).

## Tiêu chí xong

- [ ] Chạy script trên 5 PR gần nhất (#37–#41): đúng kỳ vọng ở kịch bản 7.
- [ ] Test: chạm vùng có khai (đúng file, glob), không khai, khai bằng chữ thường, khai trong PR body, không chạm vùng, base sai.
- [ ] CI xanh trên PR này (tự khai đúng); thử một commit tạm bỏ một dòng khai → job đỏ, rồi trả lại.
- [ ] `make lint` (gồm `node --test tools/lint/*.test.mjs`) xanh.
- [ ] Evidence report trong PR.

## Rủi ro / câu hỏi

1. **Chặn PR cũ đang mở:** không có PR nào đang mở.
2. **PR body sửa sau khi CI chạy:** sửa mô tả không tự chạy lại job; phải "Re-run". Ghi vào CLAUDE.md.

## Verification plan

**Mức rủi ro:** T2. Đổi CI (thêm cổng chặn merge). Cổng sai thì hoặc chặn nhầm PR tốt, hoặc để lọt; kiểm cả hai chiều, trên git thật.

**Hành vi kỳ vọng:** PR chạm vùng kiến trúc mà plan (hoặc mô tả PR) không khai thì không merge được cho tới khi khai.

**Các mức kiểm:**

- [ ] L0: `make lint`.
- [ ] L1: `node --test tools/lint/plan-zones.test.mjs` trên repo git tạm (như `architecture-zones.test.mjs`).
- [ ] L2: chạy script trên lịch sử thật (PR #37–#41) và trên chính PR này trong CI; một lần đỏ có chủ đích.

**Kịch bản:**

| # | Kịch bản | Kết quả kỳ vọng |
| --- | --- | --- |
| 1 | Chạm `CLAUDE.md`, plan khai `` `CLAUDE.md` `` | qua |
| 2 | Chạm `packages/contracts/src/eval.ts`, plan khai `` `packages/contracts/src/**` `` | qua |
| 3 | Chạm `.claude/skills/verify/FEATURE_MAP.md`, plan khai "Không" | fail, liệt kê file |
| 4 | Plan viết FEATURE_MAP không trong backtick | fail |
| 5 | Không có plan, PR body có `## Vùng kiến trúc bị chạm` + `` `.claude/skills/verify/**` `` | qua |
| 6 | Không chạm vùng | qua, "không chạm" |
| 7 | Lịch sử: #37 (plan 19), #38 (plan 20), #39 (plan 21), #41 (plan 22) | qua (đã khai, hoặc không chạm); #40 (không plan, mô tả ghi "Vùng kiến trúc:" không đúng tiêu đề) → fail: ví dụ thật check bắt được |
| 8 | Base không tồn tại | exit 2 |
| 9 | Commit tạm bỏ dòng `CLAUDE.md` khỏi mục khai của plan 23 | job CI đỏ; trả lại → xanh |

**Test mới phải đỏ trước:** viết test trước script (đỏ vì chưa có file); phá so khớp glob (`**` thành `*`) → kịch bản 2 đỏ.

**Thay đổi feature map:** không (đây là CI, không phải tính năng app).

**Những gì sẽ KHÔNG kiểm, và lý do:**

- PR từ fork (body rỗng, quyền khác): repo không nhận PR từ fork.

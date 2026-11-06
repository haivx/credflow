#!/usr/bin/env bash
# Tắt process do up.sh bật (plan 20). --clean: xoá document (và file của chúng) tạo sau mốc giờ
# up.sh ghi, trên DB dev. Không đụng staff, user, DB test. In danh sách trước khi xoá.
# Dùng: down.sh [--clean]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
cd "$ROOT"
V=.verify
CLEAN=0
[[ "${1:-}" == "--clean" ]] && CLEAN=1

if [[ -f "$V/pids" ]]; then
  while read -r name pid; do
    # PID là process group (up.sh dùng `set -m`): tắt cả cây pnpm → nest → node.
    if kill -TERM -- "-$pid" 2>/dev/null; then echo "down.sh: tắt $name ($pid)"; fi
  done <"$V/pids"
  sleep 2
  while read -r _ pid; do kill -KILL -- "-$pid" 2>/dev/null || true; done <"$V/pids"
  rm -f "$V/pids"
else
  echo "down.sh: không có $V/pids. Còn process mồ côi thì xem: lsof -iTCP:8787 -sTCP:LISTEN"
fi

if [[ $CLEAN == 0 ]]; then exit 0; fi
if [[ ! -s "$V/started-at" ]]; then
  echo "down.sh: không có $V/started-at, không biết xoá từ mốc nào. Bỏ qua --clean." >&2
  exit 1
fi
SINCE=$(tr -d '\n' <"$V/started-at")
psql_dev() { docker compose exec -T db psql -U credflow -d credflow -v ON_ERROR_STOP=1 "$@"; }

ROWS=$(psql_dev -tA -F ' ' -c "select id, storage_key, file_name from documents where created_at >= '$SINCE' order by created_at")
if [[ -z "$ROWS" ]]; then
  echo "down.sh --clean: không có document nào tạo sau $SINCE"
else
  echo "down.sh --clean: xoá document tạo sau $SINCE:"
  echo "$ROWS" | sed 's/^/  /'
  while read -r _ key _; do
    [[ -n "$key" ]] && rm -f "data/files/$key"
  done <<<"$ROWS"
  psql_dev -q -c "begin;
    delete from review_actions where document_id in (select id from documents where created_at >= '$SINCE');
    delete from documents where created_at >= '$SINCE';
    commit;"
fi
rm -f "$V/started-at"

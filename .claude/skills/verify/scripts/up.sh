#!/usr/bin/env bash
# Bật app để kiểm chứng (plan 20): Postgres + Redis, migrate + seed, API + worker (+ web) chạy nền.
# Log: .verify/logs/<tên>.log · PID: .verify/pids · mốc giờ (cho down.sh --clean): .verify/started-at
# Dùng: up.sh [--web]      Tắt: down.sh [--clean]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
cd "$ROOT"
V=.verify
WEB=0
[[ "${1:-}" == "--web" ]] && WEB=1
TIMEOUT=90

mkdir -p "$V/logs"
if [[ -f "$V/pids" ]]; then
  echo "up.sh: đã có $V/pids (app đang chạy?). Chạy down.sh trước." >&2
  exit 1
fi
busy() { lsof -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1; }
for port in 8787 $([[ $WEB == 1 ]] && echo 3000); do
  if busy "$port"; then
    echo "up.sh: cổng $port đang bận. Xem: lsof -iTCP:$port -sTCP:LISTEN" >&2
    exit 1
  fi
done

step() {
  local name=$1
  shift
  if ! "$@" >"$V/logs/$name.log" 2>&1; then
    echo "up.sh: bước $name lỗi, 20 dòng log cuối ($V/logs/$name.log):" >&2
    tail -20 "$V/logs/$name.log" >&2
    exit 1
  fi
}
step docker docker compose up -d --wait db redis
step setup make db-migrate db-seed build-packages

# Mốc giờ UTC theo đồng hồ của Postgres, để so đúng với documents.created_at.
docker compose exec -T db psql -U credflow -d credflow -tAc "select now()" >"$V/started-at"

# `set -m`: mỗi process nền có process group riêng, down.sh tắt được cả cây (pnpm → nest → node).
set -m
start() {
  local name=$1
  shift
  "$@" >"$V/logs/$name.log" 2>&1 &
  echo "$name $!" >>"$V/pids"
}
start api pnpm --filter @credflow/api dev
start worker pnpm --filter @credflow/api dev:worker
[[ $WEB == 1 ]] && start web pnpm --filter @credflow/web dev
set +m

URL=http://127.0.0.1:8787/ready
[[ $WEB == 1 ]] && URL=http://localhost:3000/api/ready
for ((i = 0; i < TIMEOUT; i++)); do
  if curl -sf "$URL" >/dev/null && grep -q "worker started" "$V/logs/worker.log"; then
    echo "up.sh: sẵn sàng sau ${i}s · API http://127.0.0.1:8787$([[ $WEB == 1 ]] && echo ' · web http://localhost:3000') · log $V/logs/"
    exit 0
  fi
  sleep 1
done

echo "up.sh: quá ${TIMEOUT}s chưa sẵn sàng ($URL hoặc worker). Log cuối:" >&2
for name in api worker $([[ $WEB == 1 ]] && echo web); do
  echo "--- $name" >&2
  tail -20 "$V/logs/$name.log" >&2
done
"$(dirname "$0")/down.sh" >/dev/null 2>&1 || true
exit 1

#!/usr/bin/env bash
# Gọi API đang chạy (plan 20). In một dòng "<status> <thời gian>" rồi body (cắt 2000 ký tự).
# Dùng: api.sh [--as <email>] METHOD PATH [@file | '<json>']
#   api.sh GET /health
#   api.sh --as staff-marisol@example.test POST /documents @eval/hard-cases/cpr/01-expires.png
#   api.sh --as reviewer@example.test GET /staff
# Đăng nhập bằng mật khẩu seed (SEED_PASSWORD, mặc định credflow-dev); cookie riêng mỗi email.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
cd "$ROOT"
BASE=${API_BASE:-http://127.0.0.1:8787}
PASSWORD=${SEED_PASSWORD:-credflow-dev}
mkdir -p .verify

AS=""
if [[ "${1:-}" == "--as" ]]; then
  AS=$2
  shift 2
fi
if [[ $# -lt 2 ]]; then
  echo "Dùng: api.sh [--as <email>] METHOD PATH [@file | '<json>']" >&2
  exit 2
fi
METHOD=$1
URL_PATH=$2
BODY=${3:-}

COOKIE=()
if [[ -n "$AS" ]]; then
  JAR=".verify/jar-${AS//[^a-zA-Z0-9]/_}.txt"
  CODE=$(curl -s -o /dev/null -w '%{http_code}' -c "$JAR" -H 'content-type: application/json' \
    -d "{\"email\":\"$AS\",\"password\":\"$PASSWORD\"}" "$BASE/auth/login")
  if [[ "$CODE" != "200" ]]; then
    echo "api.sh: đăng nhập $AS lỗi ($CODE)" >&2
    exit 1
  fi
  COOKIE=(-b "$JAR")
fi

DATA=()
if [[ "$BODY" == @* ]]; then
  DATA=(-F "file=$BODY")
elif [[ -n "$BODY" ]]; then
  DATA=(-H 'content-type: application/json' -d "$BODY")
fi

OUT=$(mktemp)
trap 'rm -f "$OUT"' EXIT
STATUS=$(curl -s -o "$OUT" -w '%{http_code} %{time_total}s' -X "$METHOD" \
  ${COOKIE[@]+"${COOKIE[@]}"} ${DATA[@]+"${DATA[@]}"} "$BASE$URL_PATH")
echo "$STATUS"
head -c 2000 "$OUT"
echo

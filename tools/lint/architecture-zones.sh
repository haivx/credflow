#!/usr/bin/env bash
# Guardrail A8: liệt kê file thay đổi thuộc vùng kiến trúc (docs/agent/architecture-zones.txt).
# In ::warning từng file và bảng vào job summary. Chạm vùng không làm job fail: Liam đọc rồi tự quyết.
# Lỗi thật (base không tồn tại, thiếu file vùng) thì fail, không im lặng báo "không chạm".
#
# Dùng: tools/lint/architecture-zones.sh <base> <head>
set -euo pipefail

base="$1"
head="$2"
zones_file="docs/agent/architecture-zones.txt"
summary="${GITHUB_STEP_SUMMARY:-/dev/null}"

git rev-parse --verify --quiet "${base}^{commit}" >/dev/null ||
  { echo "Không tìm thấy commit base: ${base}" >&2; exit 1; }
git rev-parse --verify --quiet "${head}^{commit}" >/dev/null ||
  { echo "Không tìm thấy commit head: ${head}" >&2; exit 1; }

# Mã hoá theo quy ước workflow command của GitHub cho giá trị property.
escape_property() {
  local value="$1"
  value="${value//%/%25}"
  value="${value//$'\r'/%0D}"
  value="${value//$'\n'/%0A}"
  value="${value//:/%3A}"
  value="${value//,/%2C}"
  printf '%s' "$value"
}

seen=""
rows=""
while IFS= read -r line || [[ -n "$line" ]]; do
  [[ -z "$line" || "$line" == \#* ]] && continue
  # Gán vào biến để `set -e` thấy lỗi của git. --no-renames: không có pathspec thì git chỉ in tên mới của
  # file đổi tên, mất đường dẫn trong vùng. Pathspec dưới đây đã tránh được; cờ giữ để không phụ thuộc vào đó.
  files="$(git -c core.quotepath=off diff --name-only --no-renames "${base}...${head}" -- ":(glob)${line}")"
  while IFS= read -r file; do
    [[ -z "$file" ]] && continue
    # Một file khớp nhiều pattern thì chỉ báo một lần.
    if printf '%s\n' "$seen" | grep -qxF -- "$file"; then continue; fi
    seen="${seen}${file}"$'\n'
    echo "::warning file=$(escape_property "$file")::Chạm vùng kiến trúc (${line}). Liam xem kỹ trước khi merge."
    rows="${rows}| \`${file//|/\\|}\` | \`${line}\` |"$'\n'
  done <<<"$files"
done <"$zones_file"

{
  echo "## Vùng kiến trúc (A8)"
  echo
  if [[ -z "$rows" ]]; then
    echo "Không chạm vùng kiến trúc."
  else
    echo "| File | Vùng |"
    echo "| --- | --- |"
    printf '%s' "$rows"
  fi
} >>"$summary"

#!/usr/bin/env bash
# 履歴容量の観測を1点取り、Neon の branch.logical_size を足して JSON 1 ファイルに書く（#590）。
# 本番の定期実行（.github/workflows/history-capacity-monitor.yml）とローカル検証で同じ手順を使う。
# 失敗したら、失敗を示す観測（collectionError）を書いて 0 以外で終わる。最新の観測が欠けたまま
# 古い観測で「正常」と判定させないため、判定側はこの点を最新として読み、measurement-failed（4）にする。
# 秘密値は引数に載せない。DB は PGSERVICEFILE と service 名で指し、Neon キーはヒアドキュメントで curl --config - に渡す
# （doc/document-history-operation.md「観測を取る」）。psql・curl の stderr は公開ログに接続先を出さないよう捨てる。
# 使い方: collect-history-capacity-sample.sh <出力 JSON のパス>
# 必要な環境変数: PGSERVICEFILE, HISTORY_MONITOR_PG_SERVICE, NEON_API_KEY, NEON_PROJECT_ID, NEON_BRANCH_ID
# 任意: NEON_API_BASE（既定 https://console.neon.tech/api/v2。ローカル検証で偽の受け口へ向ける）
set -uo pipefail
umask 077

out="${1:-}"
if [[ -z "$out" ]]; then
  printf '使い方: %s <出力 JSON のパス>\n' "$0" >&2
  exit 64
fi
repo_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"

fail() {
  jq -cn --arg at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --arg reason "$1" '{measuredAt: $at, collectionError: $reason}' >"$out"
  printf '観測に失敗: %s\n' "$1" >&2
  exit 1
}

for name in PGSERVICEFILE HISTORY_MONITOR_PG_SERVICE NEON_API_KEY NEON_PROJECT_ID NEON_BRANCH_ID; do
  [[ -n "${!name:-}" ]] || fail "$name が未設定"
done
# URL と service 名に入る値は形を絞る。想定外の文字で別の API や接続先を指せないようにする。
[[ "$NEON_PROJECT_ID" =~ ^[a-z0-9-]+$ ]] || fail 'NEON_PROJECT_ID の形が不正'
[[ "$NEON_BRANCH_ID" =~ ^br-[a-z0-9-]+$ ]] || fail 'NEON_BRANCH_ID の形が不正'
[[ "$HISTORY_MONITOR_PG_SERVICE" =~ ^[A-Za-z0-9_-]+$ ]] || fail 'HISTORY_MONITOR_PG_SERVICE の形が不正'
api_base="${NEON_API_BASE:-https://console.neon.tech/api/v2}"

raw="$(PGOPTIONS='-c default_transaction_read_only=on' psql -X -q -At -v ON_ERROR_STOP=1 \
  "service=$HISTORY_MONITOR_PG_SERVICE" -f "$repo_dir/script/sql/history-size-report.sql" 2>/dev/null)" ||
  fail 'psql の照会が失敗した'

logical="$(curl -fsS --max-time 30 --retry 3 --retry-delay 5 --config - "$api_base/projects/$NEON_PROJECT_ID/branches/$NEON_BRANCH_ID" 2>/dev/null <<EOF | jq -e '.branch.logical_size | numbers'
header = "Authorization: Bearer $NEON_API_KEY"
EOF
)" || fail 'Neon API から branch.logical_size を読めなかった'

jq -ce --argjson logical "$logical" '. + {branchLogicalBytes: $logical}' <<<"$raw" >"$out" 2>/dev/null ||
  fail '観測の JSON が読めない'

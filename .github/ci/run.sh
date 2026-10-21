#!/usr/bin/env bash
# なぜ: クラウドとローカルで検査対象と隔離済みE2Eの順序を揃える。
set -euo pipefail
entry=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/run.sh
root=$(cd -- "$(dirname -- "$entry")/../.." && pwd)
cd -- "$root"

require_isolated_bridge() {
  local expected="--import $root/script/isolated-neon-preload.mjs"
  case "${NODE_OPTIONS:-}" in
    "$expected"|"$expected "*) ;;
    *) echo 'Use the existing isolated E2E boundary before prepared browser checks' >&2; exit 2 ;;
  esac
}

case "${1:-fast}" in
  naming) ./script/check-naming.sh ;;
  lint) pnpm run lint ;;
  typecheck) pnpm run type-check ;;
  test) pnpm run test ;;
  build) pnpm run build ;;
  fast)
    # なぜ: 既存lintに命名検査が含まれる場合だけ二重実行を省く。不明なら明示検査を残す。
    # lint を && だけでつないだ鎖の1段が命名検査そのものなら、lint が通った時は必ず命名検査も通っている。
    # 文字列の完全一致にすると lint に検査を1つ足すたびにここが外れるため、鎖の段で判定する。
    # || や ; が混ざると途中で止まらず進む経路ができるので、その時は明示検査を残す。
    if ! python3 - <<'PY'
import json, sys
try:
    with open('package.json') as source:
        command = json.load(source)['scripts']['lint']
    steps = [step.strip() for step in command.split('&&')]
    chained_only = all(token not in command for token in ('||', ';', '\n'))
    sys.exit(0 if chained_only and './script/check-naming.sh' in steps else 1)
except (OSError, ValueError, KeyError, TypeError, AttributeError):
    sys.exit(1)
PY
    then
      bash "$entry" naming
    fi
    for phase in lint typecheck test build; do bash "$entry" "$phase"; done
    ;;
  full)
    bash "$entry" fast
    pnpm run test:e2e:local
    ;;
  history-db)
    # なぜ: 履歴の容量計測は使い捨てのローカル cluster だけで動く。CI と手元で同じ手順を通す。
    if ! command -v initdb >/dev/null 2>&1; then
      pg_bin=$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -n 1 || true)
      if [ -z "$pg_bin" ]; then echo 'PostgreSQL 16+ の bin が見つからない' >&2; exit 2; fi
      PATH="$pg_bin:$PATH"
    fi
    HISTORY_MEASURE_BURST_SAVES=20 HISTORY_MEASURE_NORMAL_SAVES=5 ./script/measure-document-history.sh
    ;;
  playwright)
    require_isolated_bridge
    pnpm run test:e2e:playwright
    ;;
  headless)
    require_isolated_bridge
    pnpm run test:e2e
    ;;
  e2e-prepared)
    require_isolated_bridge
    # なぜ: Playwright失敗後もheadlessの証跡を残し、最初の失敗を成功にしない。
    result=0
    bash "$entry" playwright || result=$?
    headless_result=0
    bash "$entry" headless || headless_result=$?
    if [ "$result" -eq 0 ]; then result=$headless_result; fi
    exit "$result"
    ;;
  *) echo "Unknown CI phase: $1" >&2; exit 2 ;;
esac

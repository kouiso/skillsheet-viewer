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
    if ! python3 - <<'PY'
import json, sys
try:
    with open('package.json') as source:
        command = json.load(source)['scripts']['lint']
    expected = 'biome check . --error-on-warnings && node script/check-jsdom-pdf-assertion.mjs && node script/check-telemetry-import.mjs && ./script/check-naming.sh'
    sys.exit(0 if command == expected else 1)
except (OSError, ValueError, KeyError, TypeError):
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

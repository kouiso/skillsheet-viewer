#!/bin/bash
# skillsheet-viewer env healer
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
REPO_DIR="/Users/kouiso/ghq/kouiso/skillsheet-viewer"
FIXED=0; ISSUES=0
echo '=== skillsheet-viewer Env Healer ==='

[ -d "$REPO_DIR/node_modules" ] && echo '✓  node_modules exists' || { echo '⚠  node_modules missing'; ISSUES=$((ISSUES+1)); }

# ── Mark session as healed ──────────────────────────────────────
PROJECT_HASH=$(echo "$CLAUDE_PROJECT_DIR" | md5 2>/dev/null || echo "default")
TOKEN_FILE="/tmp/env-healer-token-${PROJECT_HASH}"
if [ -f "$TOKEN_FILE" ]; then
  RAW=$(cat "$TOKEN_FILE")
  SESSION_ID="${RAW%%:::*}"
else
  SESSION_ID="default"
fi
STATE_DIR="$HOME/.claude/hooks/state"
mkdir -p "$STATE_DIR"
touch "$STATE_DIR/env-healed-${SESSION_ID}-${PROJECT_HASH}"
echo ""
echo "=== Done: ${FIXED} fixed, ${ISSUES} warning(s) ==="
[ "$ISSUES" -gt 0 ] && echo "⚠  Some warnings above."

#!/bin/sh
# code-review-graph のフック本体。失敗を黙って捨てず、理由を1行だけ systemMessage で出す（#643）。
# 使い方: code-review-graph-hook.sh update|status
# グラフが無い・コマンドが無いクラウドの作業場でも、フックは常に exit 0（作業は止めない）。
cat >/dev/null
git rev-parse --git-dir >/dev/null 2>&1 || exit 0

mode="$1"
reason=""
if ! command -v code-review-graph >/dev/null 2>&1; then
  reason="code-review-graph コマンドが見つからないため、グラフの${mode}を飛ばした（クラウドの作業場では必須ではない）"
else
  case "$mode" in
    update) out=$(code-review-graph update --skip-flows 2>&1) ;;
    status) out=$(code-review-graph status 2>&1) ;;
    *) out="不明なモード: ${mode}"; false ;;
  esac || reason="code-review-graph ${mode} が失敗した: $(printf '%s' "$out" | tail -n 1)"
  if [ -z "$reason" ] && [ "$mode" = status ]; then
    printf '%s\n' "$out"
  fi
fi

if [ -n "$reason" ]; then
  esc=$(printf '%s' "$reason" | tr -d '\r\n' | sed 's/\\/\\\\/g; s/"/\\"/g')
  printf '{"systemMessage":"%s"}\n' "$esc"
fi
exit 0

#!/bin/sh
# code-review-graph のフック本体。失敗を黙って捨てず、理由を1行だけ systemMessage で出す（#643）。
# 使い方: code-review-graph-hook.sh update|status
# グラフが無い・コマンドが無いクラウドの作業場でも、フックは常に exit 0（作業は止めない）。
# 内側のタイムアウト秒数は CODE_REVIEW_GRAPH_HOOK_TIMEOUT で変えられる（既定は update 25秒・status 8秒。settings.json の 30秒・10秒 より短くして、理由を出す時間を残す）。
cat >/dev/null

mode="$1"
if ! git rev-parse --git-dir >/dev/null 2>&1; then
  # 以前の SessionStart の挙動（git 管理外では一言出す）を残す。update は以前も黙っていた。
  [ "$mode" = status ] && echo 'Not a git repo, skipping'
  exit 0
fi

if [ "$mode" = status ]; then default_limit=8; else default_limit=25; fi
limit="${CODE_REVIEW_GRAPH_HOOK_TIMEOUT:-$default_limit}"
reason=""
if ! command -v code-review-graph >/dev/null 2>&1; then
  reason="code-review-graph コマンドが見つからないため、グラフの${mode}を飛ばした（クラウドの作業場では必須ではない）"
else
  # timeout コマンドが無い環境では内側のタイムアウト無しで動かす（settings.json 側の timeout が最後の砦）
  if command -v timeout >/dev/null 2>&1; then run="timeout $limit code-review-graph"; else run="code-review-graph"; fi
  rc=0
  case "$mode" in
    update) out=$($run update --skip-flows 2>&1) || rc=$? ;;
    status) out=$($run status 2>&1) || rc=$? ;;
    *) out="不明なモード: ${mode}"; rc=64 ;;
  esac
  if [ "$rc" -eq 124 ]; then
    reason="code-review-graph ${mode} が${limit}秒で時間切れになった（exit 124）"
  elif [ "$rc" -ne 0 ]; then
    last=$(printf '%s\n' "$out" | grep -v '^[[:space:]]*$' | tail -n 1)
    reason="code-review-graph ${mode} が失敗した（exit ${rc}）: ${last:-出力なし}"
  elif [ "$mode" = status ]; then
    printf '%s\n' "$out"
  fi
fi

if [ -n "$reason" ]; then
  # 制御文字(0x00-0x1f, 0x7f)は空白に置き換え、\ と " をエスケープして JSON を壊さない
  esc=$(printf '%s' "$reason" | tr '\000-\037\177' ' ' | sed 's/\\/\\\\/g; s/"/\\"/g')
  printf '{"systemMessage":"%s"}\n' "$esc"
fi
exit 0

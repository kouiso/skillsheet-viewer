#!/usr/bin/env bash
# ファイル名・ディレクトリ名が doc/dev-guide.md の規約に従っているか検査する。
#
#   規約: 英語・小文字・単数形・ケバブケース
#         （ツール／言語側の慣習が別に定まっているものだけ除外する）
#
# 人が書いても AI が書いても、コミット前と CI の両方で必ずここを通る。
# 「規約はドキュメントに書いてあるが誰も読まない」を構造的に潰すのが目的。
#
# 使い方:
#   scripts/check-naming.sh          追跡中の全ファイルを検査
#   scripts/check-naming.sh --staged ステージ済みの追加/リネームのみ検査（コミット前フック向け）
set -euo pipefail

cd "$(dirname "$0")/.."

# ケバブケース: 小文字英数字を - でつないだ形のみ。拡張子は判定対象外。
KEBAB='^[a-z0-9]+(-[a-z0-9]+)*$'

# --- 除外（理由を必ず添える。増やすときはここに理由ごと書く） ---
# 全大文字のルート文書は言語を問わない普遍的な慣習
# ドットファイルは各ツールがファイル名を規定している
# drizzle/ 配下は drizzle-kit の生成物（手で変えるとマイグレーションが壊れる）
# public/fonts・material は配布物・素材の原名
# .github/ISSUE_TEMPLATE・PULL_REQUEST_TEMPLATE は GitHub が名前を規定している
is_exempt() {
  case "$1" in
    README.md|SETUP.md|VERIFY.md|TODO.md|CLAUDE.md|AGENTS.md|LICENSE|Makefile|Dockerfile) return 0 ;;
    .*|*/.*) return 0 ;;
    packages/db/drizzle/*) return 0 ;;
    apps/web/public/fonts/*) return 0 ;;
    material/*) return 0 ;;
    .github/ISSUE_TEMPLATE/*|.github/PULL_REQUEST_TEMPLATE*) return 0 ;;
  esac
  return 1
}

# Next.js App Router の動的セグメント（[id] / [...all] / [[...slug]]）だけを検査対象から外す。
# パス全体を免除すると、動的セグメントを1つ含むだけで配下のファイル名が検査されなくなる。
is_dynamic_segment() {
  case "$1" in
    '['*']') return 0 ;;
  esac
  return 1
}

# TypeScript 以外は、その言語で標準的な流儀を許す（doc/dev-guide.md の規約どおり）。
# 例: Python は snake_case、Go は小文字1語。ここでは拡張子で判別できるものだけ扱う。
allows_language_style() {
  case "$1" in
    *.py|*.pyi) return 0 ;;
    *.go) return 0 ;;
    *.java|*.kt|*.kts|*.swift) return 0 ;;
  esac
  return 1
}

# Python は snake_case、Java/Kotlin/Swift は PascalCase、Go は小文字1語を許す。
matches_language_style() {
  case "$1" in
    *.py|*.pyi) printf '%s' "${1##*/}" | grep -qE '^[a-z_][a-z0-9_]*\.pyi?$' ;;
    *.go) printf '%s' "${1##*/}" | grep -qE '^[a-z][a-z0-9_]*\.go$' ;;
    *.java|*.kt|*.kts|*.swift) printf '%s' "${1##*/}" | grep -qE '^[A-Za-z][A-Za-z0-9]*\.[a-z]+$' ;;
    *) return 1 ;;
  esac
}

# core.quotePath=false: 日本語などの非ASCIIパスが "\346\..." にエスケープされるのを防ぐ
if [ "${1:-}" = "--staged" ]; then
  files=$(git -c core.quotePath=false diff --cached --name-only --diff-filter=AR)
else
  files=$(git -c core.quotePath=false ls-files)
fi

report=$(
  while IFS= read -r path; do
    if [ -z "$path" ]; then continue; fi
    if is_exempt "$path"; then continue; fi

    # ディレクトリ階層も含めて全セグメントを検査する。
    # 最後のセグメント（ファイル名）だけ拡張子を落とす: foo.test.tsx → foo
    base="${path##*/}"
    dirs="${path%/*}"
    if [ "$dirs" = "$path" ]; then dirs=""; fi

    bad=""
    if [ -n "$dirs" ]; then
      while IFS= read -r seg; do
        if [ -z "$seg" ]; then continue; fi
        if is_dynamic_segment "$seg"; then continue; fi
        if ! printf '%s' "$seg" | grep -qE "$KEBAB"; then bad="$seg"; break; fi
      done < <(printf '%s\n' "$dirs" | tr '/' '\n')
    fi
    if [ -z "$bad" ]; then
      if allows_language_style "$path"; then
        if ! matches_language_style "$path"; then bad="$base"; fi
      else
        name="${base%%.*}"
        if ! printf '%s' "$name" | grep -qE "$KEBAB"; then bad="$base"; fi
      fi
    fi

    if [ -n "$bad" ]; then
      printf '   %s  →  「%s」がケバブケースでない\n' "$path" "$bad"
    fi
  done <<< "$files"
)

if [ -z "$report" ]; then
  echo "✅ 命名規約OK（英語・小文字・単数形・ケバブケース）"
  exit 0
fi

count=$(printf '%s\n' "$report" | grep -c '→' || true)
echo "❌ 命名規約に違反しているパスが ${count} 件あります。" >&2
echo "   規約: 英語・小文字・単数形・ケバブケース（doc/dev-guide.md）" >&2
echo >&2
printf '%s\n' "$report" >&2
echo >&2
echo "   直し方: git mv <旧> <新> して参照元も書き換える。" >&2
echo "   ツール側が名前を規定していて変えられない場合は scripts/check-naming.sh の" >&2
echo "   is_exempt() に理由付きで追加する（無言で足さない）。" >&2
exit 1

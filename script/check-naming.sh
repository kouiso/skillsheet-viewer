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
#   script/check-naming.sh          追跡中の全ファイルを検査
#   script/check-naming.sh --staged ステージ済みの追加/リネームのみ検査（コミット前フック向け）
set -euo pipefail

# Git の非 ASCII パス出力を端末側のロケールに依存させない。
# CI 等で LC_ALL=C だと core.quotePath=false でも非 ASCII ファイル名が
# C クォートされて is_exempt のパターン判定がずれるため固定する。
export LC_ALL=C.UTF-8

cd "$(dirname "$0")/.."

# ケバブケース: 小文字英数字を - でつないだ形のみ。拡張子は判定対象外。
KEBAB='^[a-z0-9]+(-[a-z0-9]+)*$'

# --- 除外（理由を必ず添える。増やすときはここに理由ごと書く） ---
# README/LICENSE/Makefile/Dockerfile はツールが厳密な大文字綴りで exact match する。
# CLAUDE.md は Claude Code、AGENTS.md はコーディングエージェント各種がリポジトリ直下の
# 正確なファイル名として読む規約ファイル。SETUP.md は独自ドキュメントでどのツールも
# 名前を強制しないため setup.md へ改名済み（このリストには含めない）。
# ドットファイルは各ツールがファイル名を規定している
# drizzle/ 配下は drizzle-kit の生成物（手で変えるとマイグレーションが壊れる）。
# material は配布物・素材の原名。
# .github/ISSUE_TEMPLATE・PULL_REQUEST_TEMPLATE は GitHub が名前を規定している
# patch/ は `pnpm patch-commit` が `<パッケージ名>@<バージョン>.patch`
# （スコープ付きは `@` を `__` に置換）という形式でファイル名を自動生成し、
# `pnpm install` 時にこの名前で package.json の patchedDependencies から
# 参照されるため、手でケバブケースへ変えると解決できなくなる。
# app/globals.css は create-next-app が生成する既定名で、Next.js の文書も
# この名を前提にするため変えない。
# src/lib/utils.ts は shadcn/ui が生成する cn() の置き場所としての慣習名。
# 雛形の部品が `@/lib/utils` を参照するため、この1件だけ複数形を残す。
# *.stories.* は Storybook が story を拾う既定の glob で、拡張子の一部として
# 扱われる接尾辞なので単数形にはしない。
# public/font/ はフォント製品名（Noto Sans JP）由来の配布物の原名。
# 「sans」は書体分類の語で複数形ではないが、製品名を刻んだ名前なので変えない。
# doc/dogfooding-evidence/ と doc/dogfooding-result-*.md は判定根拠の証跡で、
# 改名すると結果ドキュメントから辿れなくなるため凍結する。
is_exempt() {
  case "$1" in
    README.md|CLAUDE.md|AGENTS.md|LICENSE|Makefile|Dockerfile) return 0 ;;
    .*|*/.*) return 0 ;;
    drizzle/*) return 0 ;;
    material/*) return 0 ;;
    .github/ISSUE_TEMPLATE/*|.github/PULL_REQUEST_TEMPLATE*) return 0 ;;
    patch/*) return 0 ;;
    public/font/*) return 0 ;;
    app/globals.css) return 0 ;;
    src/lib/utils.ts) return 0 ;;
    *.stories.*) return 0 ;;
    doc/dogfooding-evidence/*|doc/dogfooding-result-*.md) return 0 ;;
  esac
  return 1
}

# --- 単数形チェック ---
# 「s で終わるが複数形ではない」語尾と単語をここで赦す。増やすときは理由を添える。
#   語尾: ss(process/harness) us(status) is(analysis/emphasis)
#         ness(completeness) ous(miscellaneous) sis/xis
#   canvas:   複数形に見えるだけの単数の英単語（app/builder/canvas）
#   contents: 「table of contents」は固定の熟語で、table-of-content は非文法的
NONPLURAL_SUFFIX='(ss|us|is|ness|ous|sis|xis)$'
is_nonplural_token() {
  case "$1" in
    canvas|contents) return 0 ;;
  esac
  printf '%s' "$1" | grep -qE "$NONPLURAL_SUFFIX"
}

# 語を - で割り、s で終わるトークンを複数形の疑いとして拾う。
# この検査は機械的に「怪しいものを挙げる」まで。赦す判定は
# is_exempt / is_nonplural_token 側に寄せ、ここには理由を書かない。
plural_suspect() {
  printf '%s\n' "$1" | tr '-' '\n' | while IFS= read -r tok; do
    case "$tok" in
      *s)
        if ! is_nonplural_token "$tok"; then
          printf '%s\n' "$tok"
          break
        fi
        ;;
    esac
  done
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
    plural=""
    if [ -n "$dirs" ]; then
      while IFS= read -r seg; do
        if [ -z "$seg" ]; then continue; fi
        if is_dynamic_segment "$seg"; then continue; fi
        if ! printf '%s' "$seg" | grep -qE "$KEBAB"; then bad="$seg"; break; fi
        if [ -z "$plural" ]; then plural=$(plural_suspect "$seg"); fi
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
      continue
    fi

    if [ -z "$plural" ]; then
      if allows_language_style "$path"; then
        plural=""
      else
        plural=$(plural_suspect "${base%%.*}")
      fi
    fi
    if [ -n "$plural" ]; then
      printf '   %s  →  「%s」が複数形に見える\n' "$path" "$plural"
      continue
    fi

    # App Router の予約ファイル名（page/layout/template/...）。データモジュールが
    # うっかりこの名を取ると、Next がセグメントファイルとして読み込み、
    # default export が無いままモジュールオブジェクトが RSC payload に混入して
    # 「Module objects are not supported」で build が落ちる（実績あり）。
    # route.ts は named export（GET 等）が正なので対象外。
    case "$path" in
      app/*)
        case "$base" in
          *.test.*|*.stories.*) : ;;
          page.*|layout.*|template.*|loading.*|error.*|global-error.*|not-found.*|default.*|forbidden.*|unauthorized.*)
            if ! grep -q 'export default' "$path"; then
              printf '   %s  →  App Router の予約ファイル名だが default export がない\n' "$path"
            fi
            ;;
        esac
        ;;
    esac
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
echo "   ツール側が名前を規定していて変えられない場合は script/check-naming.sh の" >&2
echo "   is_exempt() に理由付きで追加する（無言で足さない）。" >&2
exit 1

#!/usr/bin/env python3
"""issue と PR の本文の書き方を調べる（brain #110 の 2）。AI は使わず、文字の規則だけで判定する。

issue: 次の5つの見出しがあり、中身が書いてあること。
  背景 / 今どこまで（今の状態 も可）/ 次にやること / 誰の判断待ち / 完了条件（完了の条件 も可）
PR:    概要 / 変更内容 / 関連Issue（中に `Closes #番号` か `Refs #番号` などがあること）
見出しだけ、「-」だけ、HTMLコメントだけ、「なし」「未記入」だけは未記入として扱う。
見出しの深さ（# の数）と、前の「①」などの番号は問わない。

使い方:
  python3 script/checks/format_check.py --kind issue 本文.md
  printf '%s' "$BODY" | python3 script/checks/format_check.py --kind pr --json
終了コード: 0=そろっている、1=足りない。
"""
import json
import re
import sys

ISSUE_SECTIONS = [
    ("背景", ("背景",)),
    ("今どこまで", ("今どこまで", "今の状態")),
    ("次にやること", ("次にやること",)),
    ("誰の判断待ち", ("誰の判断待ち",)),
    ("完了条件", ("完了条件", "完了の条件")),
]
PR_SECTIONS = [
    ("概要", ("概要",)),
    ("変更内容", ("変更内容",)),
    ("関連Issue", ("関連issue", "関連 issue")),
]
LINK = re.compile(r"(?i)\b(close[sd]?|fix(e[sd])?|resolve[sd]?|refs?)\s+([\w.\-]+/[\w.\-]+)?#\d+")
HEADING = re.compile(r"^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$")
EMPTY_WORDS = {"", "-", "ー", "なし", "未記入", "tbd", "todo", "n/a"}


def sections(text):
    """見出しごとに本文を分ける。返り値は {見出しの文字（小文字・番号なし）: 中身}。"""
    out, current, buf = {}, None, []
    for line in text.splitlines():
        m = HEADING.match(line)
        if m:
            if current is not None:
                out.setdefault(current, "\n".join(buf))
            title = re.sub(r"^[\s①-⑳0-9.()（）:：]+", "", m.group(1)).strip().lower()
            current, buf = title, []
        elif current is not None:
            buf.append(line)
    if current is not None:
        out.setdefault(current, "\n".join(buf))
    return out


def is_empty(body):
    body = re.sub(r"<!--.*?-->", "", body, flags=re.S)
    rest = [ln.strip().lstrip("-*• ").strip() for ln in body.splitlines()]
    return all(r.lower() in EMPTY_WORDS for r in rest)


def check(text, kind):
    """足りないものの一覧を返す。空ならそろっている。"""
    found = sections(text)
    wanted = ISSUE_SECTIONS if kind == "issue" else PR_SECTIONS
    problems = []
    for label, names in wanted:
        body = next((found[t] for t in found if any(t.startswith(n) for n in names)), None)
        if body is None:
            problems.append(f"見出し「{label}」がありません")
        elif is_empty(body):
            problems.append(f"「{label}」が未記入です")
        elif kind == "pr" and label == "関連Issue" and not LINK.search(body):
            problems.append("「関連Issue」に `Closes #番号` か `Refs #番号` がありません")
    return problems


def main(argv=None):
    args = list(sys.argv[1:] if argv is None else argv)
    kind, as_json, files = "issue", False, []
    i = 0
    while i < len(args):
        if args[i] == "--kind":
            kind = args[i + 1]
            i += 2
        elif args[i] == "--json":
            as_json = True
            i += 1
        else:
            files.append(args[i])
            i += 1
    if kind not in ("issue", "pr"):
        print("--kind は issue か pr")
        return 2
    if files:
        with open(files[0], encoding="utf-8") as f:
            text = f.read()
    else:
        text = sys.stdin.read()
    problems = check(text, kind)
    if as_json:
        print(json.dumps({"ok": not problems, "kind": kind, "problems": problems}, ensure_ascii=False))
    elif problems:
        print(f"足りない: {len(problems)} 件（{kind}）")
        print("\n".join("  - " + p for p in problems))
    else:
        print(f"OK: 書き方がそろっています（{kind}）")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())

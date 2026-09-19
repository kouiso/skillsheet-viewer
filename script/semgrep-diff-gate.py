#!/usr/bin/env python3
"""semgrep の差分ゲート。base/head 2回分の JSON 出力を比較し、head で新たに
出た findings だけを列挙して exit 1 にする。

--baseline は Semgrep AppSec Platform（SEMGREP_APP_TOKEN）専用で OSS の
`semgrep scan` には無いため、同等のものを自前で実装する。

同一性の判定は (check_id, path, マッチしたソース行のハッシュ) の多重集合差分。
行番号ではなくマッチ本文で比較するので、無関係な編集による行ズレでは
既存 findings が「新規」と誤判定されない。マッチ本文自体が変わった場合は
新規扱いになる（稀で、人が見れば分かる）。
"""

import hashlib
import json
import sys
from collections import Counter


def fingerprint(result: dict) -> tuple[str, str, str]:
    extra = result.get("extra") or {}
    lines = str(extra.get("lines") or "")
    digest = hashlib.sha256(lines.strip().encode()).hexdigest()[:16]
    return (
        str(result.get("check_id") or ""),
        str(result.get("path") or ""),
        digest,
    )


def load(path: str) -> Counter[tuple[str, str, str]]:
    with open(path, encoding="utf-8") as fh:
        doc = json.load(fh)
    return Counter(fingerprint(r) for r in doc.get("results", []))


def main() -> int:
    if len(sys.argv) != 3:
        print(f"usage: {sys.argv[0]} BASE_JSON HEAD_JSON", file=sys.stderr)
        return 2
    base = load(sys.argv[1])
    head = load(sys.argv[2])
    new_findings = head - base
    if not new_findings:
        print(f"semgrep diff gate: PASS (head={sum(head.values())}件, 新規0件)")
        return 0
    total = sum(new_findings.values())
    print(f"semgrep diff gate: 新規 findings {total}件", file=sys.stderr)
    for (check_id, path, _digest), count in sorted(new_findings.items()):
        print(f"  {count}x {check_id} {path}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())

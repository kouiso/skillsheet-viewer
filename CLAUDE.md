---
alwaysApply: true
---

@AGENTS.md

<!-- 共通ルールは AGENTS.md が正本。ここには Claude Code だけが使う設定の説明を置く（doc/ai-agent-config.md）。 -->

<!-- code-review-graph MCP tools -->
## MCP Tools: code-review-graph

**ローカルの作業場では必須。クラウドの作業場では必須ではない**（持ち主の委任を受けた manager の裁定。#630）。

- ローカル: このプロジェクトのグラフは作ってある前提で、Grep/Glob/Read で探索する前に
  `code-review-graph` の MCP ツールを使う。グラフの方が速く、トークンが少なく、
  呼び出し元・依存先・テストの有無という構造が分かる。
- クラウド: 新しい作業場ではグラフが空で、`code-review-graph` コマンド自体も無い（`uvx` だけある）。
  グラフを作る手順は入れていないので、空の結果が返ったら Grep/Glob/Read に切り替えてよい。
  グラフを作るのに時間を使わない。
- `.claude/settings.json` のフックは、`code-review-graph` が無い・失敗した時に
  理由を1行出す。出ていても、クラウドでは作業を止める理由にならない。

### グラフのツールを先に使う場面（ローカル）

- **Exploring code**: `semantic_search_nodes` or `query_graph` instead of Grep
- **Understanding impact**: `get_impact_radius` instead of manually tracing imports
- **Code review**: `detect_changes` + `get_review_context` instead of reading entire files
- **Finding relationships**: `query_graph` with callers_of/callees_of/imports_of/tests_for
- **Architecture questions**: `get_architecture_overview` + `list_communities`

グラフが答えを持っていない時、またはグラフが空の時だけ Grep/Glob/Read に戻る。

### Key Tools

| Tool | Use when |
| ------ | ---------- |
| `detect_changes` | Reviewing code changes — gives risk-scored analysis |
| `get_review_context` | Need source snippets for review — token-efficient |
| `get_impact_radius` | Understanding blast radius of a change |
| `get_affected_flows` | Finding which execution paths are impacted |
| `query_graph` | Tracing callers, callees, imports, tests, dependencies |
| `semantic_search_nodes` | Finding functions by name or keyword |
| `get_architecture_overview` | Understanding high-level codebase structure |
| `refactor_tool` | Planning renames, finding dead code |

### Workflow

1. ローカルでは、ファイルを変えるたびにフックでグラフが更新される（更新に失敗した時は理由が1行出る）。
2. Use `detect_changes` for code review.
3. Use `get_affected_flows` to understand impact.
4. Use `query_graph` pattern="tests_for" to check coverage.

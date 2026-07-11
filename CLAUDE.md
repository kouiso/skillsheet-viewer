---
alwaysApply: true
---

- 常に日本語で会話する
- 常に[prompt](prompt/prompt.md) に従うこと
- 常にプロジェクトの`doc`ディレクトリのドキュメントを前提に作業する

## プロジェクト技術スタック

このプロジェクトは以下の技術スタックを使用しています:
- **構成**: pnpm workspaces モノレポ（`apps/web` + `packages/db`）
- **言語**: TypeScript
- **フレームワーク**: Next.js 16（App Router / React Server Components）
- **UIライブラリ**: Tailwind CSS v4 + shadcn/ui（Radix UI）
- **Markdownレンダリング**: react-markdown
- **DB/ORM**: Drizzle ORM + Neon serverless Postgres（正本データ源）
- **PDF**: @react-pdf/renderer（クライアント動的 import）
- **バージョン管理**: mise（Node 22.x）/ パッケージマネージャ: pnpm

### 主要コマンド（リポジトリルートで実行）
- `pnpm dev` — 開発サーバー起動（apps/web）
- `pnpm build` — 本番ビルド
- `pnpm -r type-check` — 全パッケージ型チェック
- `pnpm -r --if-present test` — 全テスト（vitest）
- `pnpm db:generate` / `pnpm db:migrate` — Drizzle マイグレーション


<!-- code-review-graph MCP tools -->
## MCP Tools: code-review-graph

**IMPORTANT: This project has a knowledge graph. ALWAYS use the
code-review-graph MCP tools BEFORE using Grep/Glob/Read to explore
the codebase.** The graph is faster, cheaper (fewer tokens), and gives
you structural context (callers, dependents, test coverage) that file
scanning cannot.

### When to use graph tools FIRST

- **Exploring code**: `semantic_search_nodes` or `query_graph` instead of Grep
- **Understanding impact**: `get_impact_radius` instead of manually tracing imports
- **Code review**: `detect_changes` + `get_review_context` instead of reading entire files
- **Finding relationships**: `query_graph` with callers_of/callees_of/imports_of/tests_for
- **Architecture questions**: `get_architecture_overview` + `list_communities`

Fall back to Grep/Glob/Read **only** when the graph doesn't cover what you need.

### Key Tools

| Tool | Use when |
| ------ | ---------- |
| `detect_changes` | Reviewing code changes — gives risk-scored analysis |
| `get_review_context` | Need source snippets for review — token-efficient |
| `get_impact_radius` | Understanding blast radius of a change |
| `get_affected_flows` | Finding which execution paths are impacted |
| `query_graph` | Tracing callers, callees, imports, tests, dependencies |
| `semantic_search_nodes` | Finding functions/classes by name or keyword |
| `get_architecture_overview` | Understanding high-level codebase structure |
| `refactor_tool` | Planning renames, finding dead code |

### Workflow

1. The graph auto-updates on file changes (via hooks).
2. Use `detect_changes` for code review.
3. Use `get_affected_flows` to understand impact.
4. Use `query_graph` pattern="tests_for" to check coverage.

---
alwaysApply: true
---

- 常に日本語で会話する
- 常に[prompt](prompt/prompt.md) に従うこと
- **指示を受けたら、着手前に「スキルシート（個人の経歴データ）への要望」か「このアプリへの機能要求」かを分類し、どちらとして扱うかを一言で示してから動く。** このリポジトリは「経歴データの入れ物」と「それを管理するアプリ」を同時に抱えており、混ぜると、アプリの機能にすべき話をデータ直書きで済ませたり、逆に今回の提出物の都合をアプリの仕様として固定してしまう。判断がつかない要望は、分類だけを先に確認する。
- 常にプロジェクトの`doc`ディレクトリのドキュメントを前提に作業する
- テストは環境ごとに3本の設定に分かれている。`vitest.config.ts`（jsdom / 画面）、`vitest.config.node.ts`（node / `src/db` と `scripts`）、`vitest.config.pdf.ts`（node / `*.node.test.tsx`）。共通設定は `vitest.shared.ts`。
- PDF のフォント・グリフ・描画の検証は `*.node.test.tsx`（vitest.config.pdf.ts / node 環境）側で行う。jsdom 側の `*.test.tsx` では `@react-pdf/renderer` の `Font`/`renderToBuffer`/`pdf`、`pdfjs-dist` への直接 import、あるいは `renderToBuffer`/`Font.register` の直接呼び出しを禁止する。
- コメントはインラインの「なぜそうしたか」を重視し、JSDoc/docstring を全関数に付けることは求めない。パッケージ境界を越える公開 API には必要に応じて docstring を書く。

## プロジェクト技術スタック

このプロジェクトは以下の技術スタックを使用しています:
- **構成**: リポジトリルート1本の Next.js アプリ（DB 層は `src/db`）
- **言語**: TypeScript
- **フレームワーク**: Next.js 16（App Router / React Server Components）
- **データ層**: tRPC v11 + @trpc/react-query + @tanstack/react-query（`src/server/trpc/`）
- **UIライブラリ**: Tailwind CSS v4 + shadcn/ui（Radix UI）
- **Markdownレンダリング**: react-markdown
- **DB/ORM**: Drizzle ORM + Neon serverless Postgres（正本データ源）
- **PDF**: @react-pdf/renderer（クライアント動的 import）
- **バージョン管理**: mise（Node 22.x）/ パッケージマネージャ: pnpm

### 主要コマンド（リポジトリルートで実行）
- `pnpm dev` — 開発サーバー起動
- `pnpm build` — 本番ビルド
- `pnpm type-check` — 型チェック
- `pnpm test` — テスト（vitest 3本: jsdom / node[DB・スクリプト] / node[PDF]）
- `pnpm db:generate` / `pnpm db:migrate` — Drizzle マイグレーション


<!-- code-review-graph MCP tools -->
## MCP Tools: code-review-graph

**IMPORTANT: This project has a knowledge graph. ALWAYS use the
`code-review-graph` MCP tools BEFORE using Grep/Glob/Read to explore the
codebase.** The graph is faster, cheaper (fewer tokens), and gives you
structural context (callers, dependents, test coverage) that file
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
| `semantic_search_nodes` | Finding functions by name or keyword |
| `get_architecture_overview` | Understanding high-level codebase structure |
| `refactor_tool` | Planning renames, finding dead code |

### Workflow

1. The graph auto-updates on file changes (via hooks).
2. Use `detect_changes` for code review.
3. Use `get_affected_flows` to understand impact.
4. Use `query_graph` pattern="tests_for" to check coverage.

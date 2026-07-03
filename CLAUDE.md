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


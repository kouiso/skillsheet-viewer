# ONBOARDING

チームにジョインしてアプリケーションを立ち上げるところまで

## prerequisite

セットアップとその後の開発に必要な依存をインストールします。

- Machine: macOS or Windows WSL2
- Node.js: v22.x
- パッケージマネージャ: pnpm
- ランタイム管理: [mise](https://mise.jdx.dev/)（Node 22.x を固定）

<details>
<summary>mise を使った Node バージョン管理</summary>

```bash
# mise をインストール後（リンク先参照）、プロジェクトディレクトリ直下で実行
mise install
# プロジェクトの mise.toml に従って Node 22.x が入る

# pnpm が未導入なら有効化
corepack enable
```

</details>

## 初回設定

### 環境変数

このアプリはスキルシートの正本を Neon Postgres に保存します。ローカル開発では以下のサーバー専用の値が必要です。`.env`（コミット禁止）または実行環境側に設定します。

- `DATABASE_URL` — Neon Postgres 接続文字列
- `VIEWER_CODE` — 閲覧コード（HMAC 閲覧用セッションの発行に使用）
- Better Auth 用のシークレット（編集者ログインを使う場合）

値が不明な場合はチームに確認してください。

## セットアップ手順

1. **依存パッケージのインストール**

   ```bash
   pnpm install
   ```

2. **DB マイグレーションの適用**

   ```bash
   pnpm db:migrate
   ```

3. **開発サーバーの起動**

   ```bash
   pnpm dev
   ```

   - `apps/web` の開発サーバーが起動します
   - デフォルトでは `http://localhost:3000` でアクセス可能

4. **本番ビルド**

   ```bash
   pnpm build
   ```

   - Next.js の本番ビルドを実行します

## テスト・型チェック

```bash
pnpm -r type-check            # 全パッケージ型チェック
pnpm -r --if-present test     # 全テスト（vitest）
```

## 技術スタック

- **構成**: pnpm workspaces モノレポ（`apps/web` + `packages/db`）
- **フレームワーク**: Next.js 16（App Router / React Server Components）
- **言語**: TypeScript
- **UI**: Tailwind CSS v4 + shadcn/ui（Radix UI）
- **Markdown**: react-markdown
- **PDF**: @react-pdf/renderer（クライアント側で動的 import）
- **DB / ORM**: Drizzle ORM + Neon serverless Postgres
- **認証**: Better Auth（編集者ログイン）+ HMAC の閲覧コード（VIEWER_CODE）
- **テスト**: Vitest

# ONBOARDING

チームにジョインしてアプリケーションを立ち上げるところまで。
手順の本体は各ドキュメント側に持たせ、ここは順序と入口だけを置く。

## prerequisite

- Machine: macOS or Windows WSL2
- Node.js: v22.x（[mise](https://mise.jdx.dev/) が `mise.toml` で固定）
- パッケージマネージャ: pnpm（`corepack enable` で有効化）

## 手順

1. 依存インストールと環境変数: [setup.md](../setup.md) の「セットアップ手順」
   - このアプリはスキルシートの正本を Neon Postgres に保存する。`.env` はコミット禁止で、
     値が不明な場合はチームに確認する
   - 秘密値の共有は SOPS + age（setup.md 内の該当節を参照）
2. 起動確認: [README](../README.md) の「クイックスタート」
   - `pnpm dev` で `http://localhost:3000` が立ち上がる
3. 開発に入る前に: [dev-guide.md](./dev-guide.md)
   - コマンド一覧・プロジェクト構成・コーディング規約（命名規約は `script/check-naming.sh` が機械検査）
4. 実装の中身を知るには: [01-setup-and-routing.md](./01-setup-and-routing.md) から
   [05-toc-and-deploy.md](./05-toc-and-deploy.md) まで順に読む

## 技術スタック

- **構成**: リポジトリルート1本の Next.js アプリ（DB 層は `src/db`）
- **フレームワーク**: Next.js 16（App Router / React Server Components）
- **言語**: TypeScript
- **UI**: Tailwind CSS v4 + shadcn/ui（Radix UI）
- **Markdown**: react-markdown
- **PDF**: @react-pdf/renderer（クライアント側で動的 import）
- **DB / ORM**: Drizzle ORM + Neon serverless Postgres
- **認証**: Better Auth（編集者ログイン）+ HMAC の閲覧コード（VIEWER_CODE）
- **テスト**: Vitest

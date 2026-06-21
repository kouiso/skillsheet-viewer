# skillsheet-viewer プロジェクトガイド

このファイルは AI / 開発者向けのプロジェクト指針です。`CLAUDE.md` と `README.md`、`doc/` 配下のドキュメントを前提に作業してください。

## このプロジェクトの目的

エンジニアのスキルシートを「見る・編集する・PDF 出力する」ための Web アプリです。

- **閲覧（Viewer）**: 公開されたスキルシートを Markdown として整形表示する
- **編集（Builder）**: 編集者がブロック単位でスキルシートを作成・更新する
- **PDF 出力（Export）**: 表示中のスキルシートを PDF として書き出す

データの正本は DB（Neon Postgres）です。スキルシートはブロックの並びとして保存し、表示時に Markdown へ組み立てます。

## 技術スタック

- **構成**: pnpm workspaces モノレポ（`apps/web` + `packages/db`）
- **言語**: TypeScript
- **フレームワーク**: Next.js 16（App Router / React Server Components）
- **UI**: Tailwind CSS v4 + shadcn/ui（Radix UI）
- **Markdown レンダリング**: react-markdown
- **PDF**: @react-pdf/renderer（クライアント側で動的 import）
- **DB / ORM**: Drizzle ORM + Neon serverless Postgres（正本データ源）
- **ランタイム / パッケージ管理**: mise（Node 22.x）/ pnpm

## 認証の2系統設計

このアプリは目的の違う2種類の認証を持ちます。混同しないこと。

1. **編集者ログイン（Better Auth）**
   - `apps/web/src/lib/auth.ts` で `betterAuth` + Drizzle アダプタを構成
   - セッション必須。スキルシートの作成・編集はこちらが通っている場合のみ可能
   - 判定は `apps/web/src/server/auth-gate.ts`

2. **閲覧コード（HMAC / VIEWER_CODE）**
   - `VIEWER_CODE` を `/viewer-auth` で検証し、HMAC 署名付き cookie を発行
   - 署名・検証は `apps/web/src/server/session.ts`（`createHmac` + `timingSafeEqual`）
   - 閲覧専用。編集はできない。判定は `apps/web/src/server/viewer-gate.ts`

編集系の動線を触るときは Better Auth 側、閲覧系の動線を触るときは HMAC 側、というように対象を取り違えないよう注意してください。

## データの流れ（DB 中心）

- スキルシートの正本は Neon Postgres に保存（`packages/db`）
- 1枚のスキルシートは順序付きの「ブロック」の集まりとして持つ
- 表示時はブロック列を Markdown に組み立てて react-markdown でレンダリング
- DB が空のスキルシートは、初回アクセス時に既存の GitHub Markdown ソースからシードする
- サーバー専用モジュール（`packages/db/src/skillsheet.ts` など）は Client Component から import しない

## 主要コマンド（リポジトリルートで実行）

- `pnpm dev` — 開発サーバー起動（apps/web）
- `pnpm build` — 本番ビルド
- `pnpm -r type-check` — 全パッケージ型チェック
- `pnpm -r --if-present test` — 全テスト（vitest）
- `pnpm db:generate` — Drizzle マイグレーション生成
- `pnpm db:migrate` — マイグレーション適用

## 環境変数

サーバー専用の値（`DATABASE_URL` / `VIEWER_CODE` / Better Auth のシークレットなど）はリポジトリにコミットしないこと。`.env` または実行環境側で設定します。

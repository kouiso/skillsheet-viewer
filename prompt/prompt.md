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

## 完了の定義（Done Gate）

IF skillsheet-viewer で変更の完了(done)を判断する
THEN ローカルで `pnpm -r type-check` / `pnpm -r --if-present test` / `pnpm build`
  が全て exit 0 であることを静的チェックのゲートとする。
  リモートCI(GitHub Actions)の赤は、課金停止でジョブ自体が起動しないことが原因なので
  done のブロッカーにしない。
AND 振る舞いを変える変更（認証フロー・API・フォーム送信・ブロック保存など）は、
  上記の静的チェックに加えて実際に動かして確認(live E2E)できてはじめて done とする。
  型・テスト・ビルドの緑だけでは振る舞いの done を満たさない。
AND UI/挙動を変えるユニット（コンポーネント・画面・エンドポイント）を複数実装するときは、
  1ユニット完成するごとにその場でブラウザ描画をスクリーンショットで目視してから次へ進む
  （作る→動かす→見る＝1セット）。全ユニット実装後にまとめて初めて検証するのは違反。
  目視には PC 幅に加えてモバイル幅（390px 目安）での横スクロール有無を含める。
  Workflow/エージェントに実装を委譲する場合は、各エージェントの指示文に
  この per-unit 検証を必須ステップとして明記する（省いた台本を書かない）。
  ※ グローバル対応版: `~/.claude/rules/ask-and-investigate.md`「Build-One-Confirm-One Cadence」。
  この repo ローカル節は、2026-07-12 にそのグローバル rule がロード済みでもオーケストレーション
  圧下で発火せず（Workflow で複数UIユニットをバッチ実装し最後に一括検証、モバイル横スクロール
  バグが後から発覚）、ユーザーから直接是正が入った実例を受けて設置した。
  エスカレーション: 「バッチ実装→最後に一括検証」がどのリポでも再発したら、
  4本目の文章追加を選ばない。Workflow ブリーフ本文への決定論的チェック（hook等）を構築する。
BECAUSE GitHub Actions はアカウント課金停止でジョブが起動せずリポ全体が常時赤になり
  品質信号にならない。ローカルの静的チェックがその代替を提供する。
※ 課金が復旧しリモートCIが緑運用に戻ったら本ルールは見直す（恒久的にCI赤を隠さない）。

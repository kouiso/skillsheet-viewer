# skillsheet-viewer プロジェクトガイド

このファイルは AI / 開発者向けのプロジェクト指針です。`AGENTS.md` と `README.md`、`doc/` 配下のドキュメントを前提に作業してください。

## このプロジェクトの目的

エンジニアのスキルシートを「見る・編集する・PDF 出力する」ための Web アプリです。

- **閲覧（Viewer）**: 公開されたスキルシートを Markdown として整形表示する
- **編集（Builder）**: 編集者がブロック単位でスキルシートを作成・更新する
- **PDF 出力（Export）**: 表示中のスキルシートを PDF として書き出す

データの正本は DB（Neon Postgres）です。スキルシートはブロックの並びとして保存し、表示時に Markdown へ組み立てます。

## 技術スタック

- **構成**: リポジトリルート1本の Next.js アプリ（DB 層は `src/db`）
- **言語**: TypeScript
- **フレームワーク**: Next.js 16（App Router / React Server Components）
- **データ層**: tRPC v11 + @trpc/react-query + @tanstack/react-query（`src/server/trpc/`）。RSC は server caller で直呼び、クライアントは HTTP 経由（`/api/trpc/[trpc]`）。認可・入力検証（zod）・エラーコードは procedure に集約
- **UI**: Tailwind CSS v4 + shadcn/ui（Radix UI）
- **Markdown レンダリング**: react-markdown
- **PDF**: @react-pdf/renderer（クライアント側で動的 import）
- **DB / ORM**: Drizzle ORM + Neon serverless Postgres（正本データ源）
- **ランタイム / パッケージ管理**: mise（Node 22.x）/ pnpm

## 認証の2系統設計

このアプリは目的の違う2種類の認証を持ちます。混同しないこと。

1. **編集者ログイン（Better Auth）**
   - `src/lib/auth.ts` で `betterAuth` + Drizzle アダプタを構成
   - セッション必須。スキルシートの作成・編集はこちらが通っている場合のみ可能
   - 判定は `src/server/auth-gate.ts`

2. **閲覧コード（HMAC / VIEWER_CODE）**
   - `VIEWER_CODE` を `/viewer-auth` で検証し、HMAC 署名付き cookie を発行
   - 署名・検証は `src/server/session.ts`（`createHmac` + `timingSafeEqual`）
   - 閲覧専用。編集はできない。判定は `src/server/viewer-gate.ts`

編集系の動線を触るときは Better Auth 側、閲覧系の動線を触るときは HMAC 側、というように対象を取り違えないよう注意してください。

## データの流れ（DB 中心）

- スキルシートの正本は Neon Postgres に保存（`src/db`）
- 1枚のスキルシートは順序付きの「ブロック」の集まりとして持つ
- 表示時はブロック列を Markdown に組み立てて react-markdown でレンダリング
- DB が空のスキルシートは、初回アクセス時に既存の GitHub Markdown ソースからシードする
- サーバー専用モジュール（`src/db/skillsheet.ts` など）は Client Component から import しない

## 主要コマンド（リポジトリルートで実行）

- `pnpm dev` — 開発サーバー起動
- `pnpm build` — 本番ビルド
- `pnpm lint` — biome と独自検査（命名規約・共通 Skill の生成物のずれを含む）
- `pnpm type-check` — 全パッケージ型チェック
- `pnpm test` — 全テスト（vitest）
- `pnpm db:generate` — Drizzle マイグレーション生成
- `pnpm db:migrate` — マイグレーション適用

## 環境変数

DB のパスワード、トークン、age 鍵などの秘密値（`DATABASE_URL` / Better Auth のシークレットなど）はリポジトリにコミットしないこと。`.env` または実行環境側で設定します。

`VIEWER_CODE`（閲覧コード）はこの禁止の対象外。リポジトリ所有者（kouiso）の判断（2026-09-24）により、現時点ではパスワード相当として扱わない。本番の値はローカル既定値と同じで、在処は `doc/onboarding.md` の「本番環境と接続先」を見る。

## 完了の定義（Done Gate）

IF skillsheet-viewer で変更の完了(done)を判断する
THEN ローカルで `pnpm lint` / `pnpm type-check` / `pnpm test` / `pnpm build`
  が全て exit 0 であることを静的チェックのゲートとする。
  `pnpm lint` は CI の lint の脚でも必ず走る（biome・命名規約・共通 Skill の同期検査を含む）。
  リモートCI(GitHub Actions)の赤も done のブロッカーとする。CI は pull_request と
  main への push で実際に動いており、課金停止でジョブが起動しない状況は解消済み
  （2026-11-13 に直近の実行を確認）。赤の時は無視せず、ログで原因を読む。
  コードが原因なら直す。apt の名前解決失敗のような環境の一時失敗なら、
  そう分かるログを PR に残して再実行する。
  下書き（Draft）の PR では CI の主なジョブ（changes・命名・node）が skip される。
  skip は緑ではない。全ジョブが終わって緑になるまで done にしない。
  手元の4つの検査は、push する最後の head（証拠の画像やログを足した後）で回す。
  画像の名前も命名規約の検査に掛かるので、画像を足す前の結果を PR に貼らない。
AND 振る舞いを変える変更（認証フロー・API・フォーム送信・ブロック保存など）は、
  上記の静的チェックに加えて実際に動かして確認(live E2E)できてはじめて done とする。
  型・テスト・ビルドの緑だけでは振る舞いの done を満たさない。
AND UI/挙動を変えるユニット（コンポーネント・画面・エンドポイント）を複数実装するときは、
  1ユニット完成するごとにその場でブラウザ描画をスクリーンショットで目視してから次へ進む
  （作る→動かす→見る＝1セット）。全ユニット実装後にまとめて初めて検証するのは違反。
  目視には PC 幅に加えてモバイル幅（390px 目安）での横スクロール有無を含める。
  Workflow/エージェントに実装を委譲する場合は、各エージェントの指示文に
  この per-unit 検証を必須ステップとして明記する（省いた台本を書かない）。
  ※ 対応するグローバル版は、作業者の手元にだけある `~/.claude/rules/ask-and-investigate.md`
  「Build-One-Confirm-One Cadence」。このリポジトリには入っておらず、読めない環境ではこの節だけを正とする。
  この repo ローカル節は、2026-07-12 にそのグローバル rule がロード済みでもオーケストレーション
  圧下で発火せず（Workflow で複数UIユニットをバッチ実装し最後に一括検証、モバイル横スクロール
  バグが後から発覚）、ユーザーから直接是正が入った実例を受けて設置した。
  エスカレーション: 「バッチ実装→最後に一括検証」がどのリポでも再発したら、
  4本目の文章追加を選ばない。Workflow ブリーフ本文への決定論的チェック（hook等）を構築する。
BECAUSE リモートCIは生きた品質信号で、赤を無視すると merge 済みの破壊を見逃す。
  ローカルの静的チェックは、CI を待たずに同じ検査を先に通すためのもので、CI の代わりではない。

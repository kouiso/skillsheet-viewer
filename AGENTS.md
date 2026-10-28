# AGENTS.md

## Overview
skillsheet-viewer - kouiso プロジェクト

このファイルが、どの開発 AI にも共通するルールの正本。Claude Code は `CLAUDE.md` の import 経由で読む。
正本・生成物・AI 専用設定の区分と、AI ごとの入口は `doc/ai-agent-config.md` にある。

## 共通ルール

- 常に日本語で会話する
- 常に[prompt](prompt/prompt.md) に従うこと
- **指示を受けたら、着手前に「スキルシート（個人の経歴データ）への要望」か「このアプリへの機能要求」かを分類し、どちらとして扱うかを一言で示してから動く。** このリポジトリは「経歴データの入れ物」と「それを管理するアプリ」を同時に抱えており、混ぜると、アプリの機能にすべき話をデータ直書きで済ませたり、逆に今回の提出物の都合をアプリの仕様として固定してしまう。両方に該当するときは「両方」と示し、アプリ側の変更とシート側のデータ変更を別々の成果物（別 SBI）に分け、質問も混ぜない。判断がつかない要望は、分類だけを先に確認する。
- 常にプロジェクトの`doc`ディレクトリのドキュメントを前提に作業する
- テストは環境ごとに3本の設定に分かれている。`vitest.config.ts`（jsdom / 画面）、`vitest.config.node.ts`（node / `src/db` と `script`）、`vitest.config.pdf.ts`（node / `*.node.test.tsx`）。共通設定は `vitest.shared.ts`。
- PDF のフォント・グリフ・描画の検証は `*.node.test.tsx`（vitest.config.pdf.ts / node 環境）側で行う。jsdom 側の `*.test.tsx` では `@react-pdf/renderer` の `Font`/`renderToBuffer`/`pdf`、`pdfjs-dist` への直接 import、あるいは `renderToBuffer`/`Font.register` の直接呼び出しを禁止する。
- コメントはインラインの「なぜそうしたか」を重視し、JSDoc/docstring を全関数に付けることは求めない。パッケージ境界を越える公開 API には必要に応じて docstring を書く。
- 共通 Skill は `.agents/skills/<name>/SKILL.md` が正本。`.claude/skills/` の同名フォルダは生成物なので手で直さず、正本を直してから `node script/sync-agent-config.mjs` を実行する。

## PDF 出力・閲覧・本番データ更新
本番 URL・閲覧コード・編集者ログイン・本番 DB の在処は [doc/onboarding.md](doc/onboarding.md) の「本番環境と接続先」、
PDF をローカルで出す手順と本番 DB のブロックを直す手順は [doc/pdf-export-and-data-update.md](doc/pdf-export-and-data-update.md) にある。
依頼者にログインやボタン操作を頼む前に、必ず上の2か所を見る。

## Development

### プロジェクト技術スタック
- **構成**: リポジトリルート1本の Next.js アプリ（DB 層は `src/db`）
- **言語**: TypeScript
- **フレームワーク**: Next.js 16（App Router / React Server Components）
- **データ層**: tRPC v11 + @trpc/react-query + @tanstack/react-query（`src/server/trpc/`）
- **UIライブラリ**: Tailwind CSS v4 + shadcn/ui（Radix UI）
- **Markdownレンダリング**: react-markdown
- **DB/ORM**: Drizzle ORM + Neon serverless Postgres（正本データ源）
- **PDF**: @react-pdf/renderer（クライアント動的 import）
- **バージョン管理**: mise（Node 22.x）/ パッケージマネージャ: pnpm

### Setup
```bash
pnpm install --frozen-lockfile
```

### 主要コマンド（リポジトリルートで実行）
- `pnpm dev` — 開発サーバー起動
- `pnpm build` — 本番ビルド
- `pnpm lint` — biome と独自検査（命名規約・共通 Skill の生成物のずれを含む）
- `pnpm type-check` — 型チェック
- `pnpm test` — テスト（vitest 3本: jsdom / node[DB・スクリプト] / node[PDF]）
- `pnpm db:generate` / `pnpm db:migrate` — Drizzle マイグレーション

### Code Style
- 日本語でコメント・ドキュメントを記述
- 既存コードスタイルに従う

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## GitHub Project での作業管理

- この repo の作業は GitHub Project（`.github/scrum-board.yml` の番号）で管理する
- 次にやる物を決める・課題を起票する・Status を動かす・繰り越す時は、必ず先に `.agents/skills/scrum-board/SKILL.md`（`.claude/skills/scrum-board/`）を読んでから手を付ける
- 読めない・見つからない場合の要点: 次にやる物=盤の「今週の Iteration」で Wait 空の先頭（無ければ「無し」と答える・issue一覧や open PR から選ばない）・課題は題の頭に `[PBI]`/`[SBI]` を付け sub-issue と盤登録と項目（Iteration・Priority・Estimate・Size）までやる・繰り越しは `kouiso/.github` の `scripts/scrum_keeper/scrum_keeper.py --job carryover|okawari` を使う
- Status は Backlog / In progress / In review / Done の 4 つ。Todo は作らん

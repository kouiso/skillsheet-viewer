# ONBOARDING

チームにジョインしてアプリケーションを立ち上げるところまで。
手順の本体は各ドキュメント側に持たせ、ここは順序と入口だけを置く。

## prerequisite

- Machine: macOS or Windows WSL2
- Node.js: v22.x（[mise](https://mise.jdx.dev/) が `mise.toml` で固定）
- パッケージマネージャ: pnpm（mise が導入）

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
   [06-remote-mcp.md](./06-remote-mcp.md) まで順に読む

## 本番環境と接続先

「PDF を出して」「中身を直して」と頼まれたら、最初にここを見る。依頼者にログインやボタン操作を頼まない。
在処を探し回って時間を失った事故があったので、答えを先に置いておく。

| 知りたいこと | 在処 |
| --- | --- |
| 本番 URL | https://skill-sheet-snowy.vercel.app（Vercel プロジェクト `skillsheet-viewer`。main へのマージがそのまま本番に出る） |
| 閲覧コード | Vercel の環境変数 `VIEWER_CODE`（Production）。値は `script/dev-local-stack.sh` のローカル既定値と同じ `view123`。リポジトリ所有者（kouiso）の判断（2026-09-24）により現時点ではパスワード相当として扱わない。変えるときは Vercel の `VIEWER_CODE` を更新する |
| 編集者ログイン（`/login`） | 1Password で「skillsheet-viewer prod owner」を検索して出る項目 |
| 本番 DB | Neon プロジェクト `cool-boat-26004396` の `main` ブランチ。接続文字列は Neon MCP の `get_connection_string` か、1Password の「skillsheet-viewer Neon DATABASE_URL」 |
| ローカル用 `.env` | `.env.enc`（SOPS / age）。鍵は 1Password の「skillsheet-viewer SOPS age key」 |

DB のパスワード・トークン・age 鍵・メールアドレスなど値そのものはここにもコミットにも書かない。上の表はすべて
1Password の項目名か Neon MCP の呼び出しだけを指す。

PDF の最短経路（ローカルで印刷コードを直接呼ぶ。数秒で終わる）と、本番 DB のブロックを直す手順（退避ブランチ + CAS）は
[doc/pdf-export-and-data-update.md](./pdf-export-and-data-update.md) にある。

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

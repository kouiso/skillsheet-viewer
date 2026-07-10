# Engineer Skill Sheet Viewer - セットアップガイド

エンジニアのスキルシートを **閲覧・編集・PDF 出力** するための Web アプリケーションです。スキルシートの正本は Neon Postgres に保存し、順序付きの「ブロック」の集まりとして持ちます（表示時に Markdown へ組み立てて描画）。

## アーキテクチャ概要

```
編集者（Better Auth ログイン）        閲覧者（閲覧コード / HMAC）
        │                                    │
        ▼                                    ▼
Next.js 16 App（apps/web, Vercel）
  ├── /builder  … ブロック単位で編集（要 Better Auth セッション）
  ├── /view 系  … スキルシートを Markdown 整形表示・PDF 出力
  └── /compare  … 2 枚を並べて比較
        │
        ▼
Neon serverless Postgres（正本データ源 / Drizzle ORM, packages/db）
  ├── skill_sheets / blocks         … スキルシート本体（ブロック列）
  └── user / session / account / …  … Better Auth のテーブル
        ▲
        │ 初回アクセス時のみ（任意・副系統）
GitHub Private Repository（Markdown シード元）
```

- **正本は DB（Neon）**。DB が空のスキルシートは、初回アクセス時に既存の GitHub Markdown ソースからシードします（GitHub 連携は任意の副系統）。

## 前提

- Machine: macOS または Windows WSL2
- Node.js: v22.x（`mise` で固定。`mise.toml` = Node 22.21.1 / pnpm 10.33.0）
- パッケージマネージャ: pnpm（`corepack enable` で有効化）
- **Neon Postgres が必須**（`DATABASE_URL`）。ローカルでも接続先の Postgres が必要です

```bash
# mise をインストール後（https://mise.jdx.dev/）、リポジトリ直下で
mise install       # .tool-versions / mise.toml に従って Node 22.x を導入
corepack enable    # pnpm を有効化
```

## セットアップ手順

### 1. 依存パッケージのインストール

```bash
pnpm install
```

### 2. 環境変数の設定

`.env.example` をコピーして `.env`（コミット禁止）に値を設定します。**すべてサーバー専用**で、ブラウザには公開しません（`NEXT_PUBLIC_` を付けないこと）。

```bash
cp .env.example .env
```

#### 必須（欠けると起動時に fail-fast で throw / `apps/web/src/lib/env.ts`）

| 変数 | 用途 |
|------|------|
| `DATABASE_URL` | Neon Postgres 接続文字列（正本データ源） |
| `SESSION_SECRET` | 閲覧用 HMAC セッション cookie の署名鍵（32 文字以上推奨） |
| `VIEWER_CODE` | 閲覧コード（`/viewer-auth` で入力する共有コード） |
| `BETTER_AUTH_SECRET` | 編集者ログイン（Better Auth）の署名鍵（`openssl rand -base64 32`） |
| `SKILLSHEET_OWNER_ID` | 表示・編集対象スキルシートのオーナー識別子（単一オーナー運用の安定キー） |

#### 任意

| 変数 | 用途 |
|------|------|
| `GITHUB_TOKEN` / `GITHUB_OWNER` / `GITHUB_REPO` | GitHub 読み取り副系統・初回シード用（未設定なら warn のみ。DB 表示には影響しない） |
| `GITHUB_FILE_PATH` / `GITHUB_BRANCH` | シード元ファイル・ブランチ（既定 `skillsheet.md` / `main`） |
| `BETTER_AUTH_URL` | デプロイ先 URL（省略時はリクエスト origin から推定） |
| `APP_ENV` | 非 Vercel 環境での cookie Secure 判定補助（`production` / `preview` で Secure 付与。Vercel では `VERCEL_ENV` を優先） |
| `REVALIDATE_SECRET` | GitHub 読み経路のキャッシュを `/api/revalidate` から手動失効させるためのシークレット |

> DB 接続文字列は、実行時はプール用（`-pooler` ホスト）、マイグレーションは非プール文字列を使うと安定します。

### 3. DB マイグレーションの適用

```bash
pnpm db:migrate
```

- **新規（fresh）DB**: そのまま実行すれば Drizzle が全マイグレーションを適用します。
- **既存本番 DB**: Better Auth CLI などで先にテーブルが作られている場合、そのまま流すと「テーブルが既に存在する」で失敗します。最初に 1 回だけ baseline を行ってから通常運用に移します。手順は [`packages/db/drizzle/MIGRATION-BASELINE.md`](./packages/db/drizzle/MIGRATION-BASELINE.md) を参照してください。

### 4. 開発サーバーの起動

```bash
pnpm dev
```

→ http://localhost:3000 にアクセス。

## 認証の 2 系統

このアプリは目的の違う 2 種類の認証を持ちます（混同しないこと）。

### 1. 閲覧コード（HMAC / `VIEWER_CODE`）

- `/viewer-auth` で共有コードを入力 → `POST /api/auth` が `VIEWER_CODE` を `timingSafeEqual` で照合し、HMAC 署名付きセッション cookie を発行（`apps/web/src/server/session.ts`）
- `/view` 配下の閲覧のみ許可。**編集はできない**（判定は `apps/web/src/server/viewer-gate.ts`）
- ログアウトは `POST /api/logout`

### 2. 編集者ログイン（Better Auth）

- `/login` で email / password ログイン（`apps/web/src/lib/auth.ts` の `betterAuth` + Drizzle アダプタ、エンドポイントは `/api/auth/[...all]`）
- セッション必須。スキルシートの作成・編集は編集者ログインが通っている場合のみ可能（判定は `apps/web/src/server/auth-gate.ts` の `isEditor()`）
- **サインアップ UI はなく、単一オーナー運用**です。`SKILLSHEET_OWNER_ID` に対応するオーナーアカウントのみが編集対象を持ちます

### オーナーアカウントのブートストラップ手順

> TODO（親エージェントが最終補記）: 単一オーナー運用のため、UI からのサインアップは無効です。オーナーアカウントは Better Auth のテーブル（`user` / `account`）に一時的な手段で直接作成し、その `user.id` を `SKILLSHEET_OWNER_ID` に設定します。作成した email / password で `/login` からログインし、`/builder` で編集できることを確認してください。（具体的な作成コマンド・SQL はここに補記予定）

## Vercel へのデプロイ

本番は Vercel のネイティブ GitHub 連携で運用します。

1. **プロジェクト作成**: Vercel で対象リポジトリをインポート（Framework Preset は Next.js が自動検出）
2. **環境変数**: 上記「必須」＋必要な「任意」を Vercel Dashboard → Settings → Environment Variables に設定（Production / Preview / Development の対象を確認）
3. **DB**: Neon を接続。`DATABASE_URL` はランタイム専用のため、DB 依存ページは `connection()` で動的レンダリング化されており、`next build` の静的解析フェーズでは検証をスキップします
4. **デプロイ**: `main` への push で本番デプロイ、Pull Request で preview デプロイが自動実行されます

## トラブルシューティング

### 起動時に「必須のサーバー環境変数が設定されていません」

- `.env` に `DATABASE_URL` / `SESSION_SECRET` / `VIEWER_CODE` / `BETTER_AUTH_SECRET` / `SKILLSHEET_OWNER_ID` が揃っているか確認

### スキルシートが表示されない

- `DATABASE_URL` が正しいか、マイグレーションが適用済みか（`pnpm db:migrate`）を確認
- 閲覧時は `/viewer-auth` の HMAC セッション、編集時は `/login` の Better Auth セッションが有効か確認

### 認証コードが通らない

- 入力コードと `.env` の `VIEWER_CODE` が一致するか確認（`POST /api/auth` が 401 を返す場合は不一致）

### ビルド・依存エラー

```bash
rm -rf node_modules apps/web/node_modules packages/db/node_modules
pnpm install
pnpm -r type-check
```

## ライセンス

UNLICENSED

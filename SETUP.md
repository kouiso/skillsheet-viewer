# Engineer Skill Sheet Viewer - セットアップガイド

エンジニアのスキルシートを **閲覧・編集・PDF 出力** するための Web アプリケーションです。スキルシートの正本は Neon Postgres に保存し、順序付きの「ブロック」の集まりとして持ちます（表示時に Markdown へ組み立てて描画）。

## アーキテクチャ概要

```
編集者（Better Auth ログイン）        閲覧者（閲覧コード / HMAC）
        │                                    │
        ▼                                    ▼
Next.js 16 App（リポジトリルート, Vercel）
  ├── /builder  … ブロック単位で編集（要 Better Auth セッション）
  └── /view 系  … スキルシートを Markdown 整形表示・PDF 出力
        │
        ▼
Neon serverless Postgres（正本データ源 / Drizzle ORM, src/db）
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
例外は Sentry/PostHog の DSN・キー・ホストと、ローカル検証用の非常口（後述）のみ — ブラウザ SDK に埋め込む前提の値で秘匿情報ではない。

```bash
cp .env.example .env
```

#### 実際の値の共有（SOPS + age）

このリポジトリでは、開発用の実値を入れた `.env` を [SOPS](https://github.com/getsops/sops) で暗号化した `.env.enc` としてリポジトリにコミットしています（平文の `.env` 自体はコミットしません）。復号鍵（age 秘密鍵）は 1Password の `RITMO` vault に `skillsheet-viewer SOPS age key` として保存済みです。

**入れてよい値・漏れたときの手順**（このリポジトリは公開で、`.env.enc` は git 履歴に恒久的に残る）:

- `.env.enc` に入れるのは**ローカル開発用の値だけ**。本番（Vercel）の `DATABASE_URL` / `SESSION_SECRET` / `VIEWER_CODE` / `BETTER_AUTH_SECRET` は入れない（本番値は Vercel の環境変数だけに置く）。
- age 秘密鍵が漏れた（漏れたかもしれない）ときは、`.env.enc` を消しても履歴から復号できるので、**中の全値をローテーションする**のが唯一の対処。鍵の再生成と `.sops.yaml` の recipient 更新はその後。

```bash
# 初回のみ：1Password から秘密鍵を取り出してローカルに保存
umask 077
mkdir -p ~/.config/sops/age
key_tmp="$(mktemp ~/.config/sops/age/skillsheet-viewer.XXXXXX)"
op item get "skillsheet-viewer SOPS age key" --vault RITMO --fields notesPlain --format json \
  | jq -r '.value' | grep -v '^#' > "$key_tmp"
mv "$key_tmp" ~/.config/sops/age/skillsheet-viewer.txt

export SOPS_AGE_KEY_FILE=~/.config/sops/age/skillsheet-viewer.txt

# 復号して .env を作る
pnpm env:decrypt

# .env を編集したら、暗号化し直してコミットする
pnpm env:encrypt
```

#### 必須（欠けると起動時に fail-fast で throw / `src/lib/env.ts`）

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
| `REVALIDATE_SECRET` | tRPC の `maintenance.revalidate` でキャッシュを手動失効させるためのシークレット |

> DB 接続文字列は、実行時はプール用（`-pooler` ホスト）、マイグレーションは非プール文字列を使うと安定します。

#### 監視・計測（Sentry / PostHog。すべて任意。未設定なら自動で no-op。詳細は [doc/observability.md](doc/observability.md)）

| 変数 | 用途 |
|------|------|
| `NEXT_PUBLIC_SENTRY_DSN` | Sentry の送信先。未設定なら `Sentry.init` を呼ばない |
| `NEXT_PUBLIC_POSTHOG_KEY` | PostHog のプロジェクトキー。未設定なら `posthog.init` を呼ばない |
| `NEXT_PUBLIC_POSTHOG_HOST` | PostHog のホスト（既定 `https://us.i.posthog.com`） |
| `NEXT_PUBLIC_OBSERVABILITY_FORCE` | ローカル検証用の非常口（`'1'` のみ有効）。**検証後は必ず消す** — 付けっぱなしだと e2e が本番プロジェクトに書く |
| `SENTRY_ORG` / `SENTRY_PROJECT` / `SENTRY_AUTH_TOKEN` | source map アップロード用。**Vercel のビルド環境にのみ**設定し、GitHub Actions には入れない |

### 3. DB マイグレーションの適用

```bash
pnpm db:migrate
```

- **新規（fresh）DB**: そのまま実行すれば Drizzle が全マイグレーションを適用します。
- **既存本番 DB**: Better Auth CLI などで先にテーブルが作られている場合、そのまま流すと「テーブルが既に存在する」で失敗します。最初に 1 回だけ baseline を行ってから通常運用に移します。手順は [`drizzle/MIGRATION-BASELINE.md`](./drizzle/MIGRATION-BASELINE.md) を参照してください。

### 4. 開発サーバーの起動

```bash
pnpm dev
```

→ http://localhost:3000 にアクセス。

## 認証の 2 系統

このアプリは目的の違う 2 種類の認証を持ちます（混同しないこと）。

### 1. 閲覧コード（HMAC / `VIEWER_CODE`）

- `/viewer-auth` で共有コードを入力 → tRPC の `auth.login` が `VIEWER_CODE` を `timingSafeEqual` で照合し、HMAC 署名付きセッション cookie を発行（`src/server/session.ts`）
- `/view` 配下の閲覧のみ許可。**編集はできない**（判定は `src/server/viewer-gate.ts`）
- ログアウトは tRPC の `auth.logout`。旧クライアント向けの `POST /api/logout` も同じ procedure へ委譲

### 2. 編集者ログイン（Better Auth）

- `/login` で email / password ログイン（`src/lib/auth.ts` の `betterAuth` + Drizzle アダプタ、エンドポイントは `/api/auth/[...all]`）
- セッション必須。スキルシートの作成・編集は編集者ログインが通っている場合のみ可能（判定は `src/server/auth-gate.ts` の `isEditor()`）
- **サインアップ UI はなく、単一オーナー運用**です。`SKILLSHEET_OWNER_ID` に対応するオーナーアカウントのみが編集対象を持ちます

### オーナーアカウントのブートストラップ手順

単一オーナー運用のため、UI からのサインアップは無効です（`emailAndPassword.disableSignUp: true`）。最初のオーナーアカウントは `scripts/bootstrap-owner.ts` で直接作成します。このスクリプトは Better Auth 自身の `/sign-up/email` と同じ手順（`auth.$context` → `ctx.password.hash()` でハッシュ生成 → `user` 行を作成 → `provider_id = 'credential'` の `account` 行を作成）を踏むため、パスワードハッシュの形式や `user.id` の生成規則を手で合わせる必要はありません。

1. `.env` に `DATABASE_URL` / `BETTER_AUTH_SECRET` を設定済みであること（`SKILLSHEET_OWNER_ID` はこの時点ではまだ値が無くて構いません）
2. マイグレーションを適用し、`user` / `account` テーブルを作成しておく（未実施なら `pnpm db:migrate`）
3. オーナーアカウントを作成する（メールアドレスは任意の値に置き換えてください）

   ```bash
   pnpm exec tsx scripts/bootstrap-owner.ts --email='owner@example.com'
   ```

   `--password` を省略して対話端末（TTY）から実行すると、画面には表示されない対話プロンプトでパスワードの入力を求められます（8 文字以上を推奨）。シェル履歴や `ps` のプロセス引数一覧に平文で残らないため、この方法を推奨します。

   標準出力に `user.id`（例: `f47ac10b-58cc-4372-a567-0e02b2c3d479` のような文字列）が表示されます。

   > CI・自動化スクリプトなど非対話環境から実行する場合のみ、`--password='...'` 引数または `SKILLSHEET_OWNER_PASSWORD` 環境変数で指定できます。どちらもシェル履歴や `ps` に平文で残るリスクがあるため、対話端末が使える環境では避けてください。

4. 出力された `user.id` を `.env`（本番は Vercel の環境変数）の `SKILLSHEET_OWNER_ID` に設定する
5. `pnpm dev` を起動し、手順3で使った email / password で `/login` からログインできること、`/builder` で編集できることを確認する

> 既に同じ email のオーナーが存在する状態で再実行した場合は、新規作成ではなく**パスワードの再発行**として動作します（`user.id` は変わらないため `SKILLSHEET_OWNER_ID` の再設定は不要です）。パスワードを紛失した場合の再発行手順としても同じコマンドが使えます。

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

- 入力コードと `.env` の `VIEWER_CODE` が一致するか確認（`auth.login` が `UNAUTHORIZED` を返す場合は不一致）

### ビルド・依存エラー

```bash
rm -rf node_modules
pnpm install
pnpm type-check
```

## ライセンス

UNLICENSED

# スキルシート管理システム

Markdownで管理できるスキルシート・ポートフォリオサイト。管理者認証と閲覧者認証のデュアル認証システムを備えています。

## 主な機能

### 管理者機能
- ID/パスワードによるログイン（NextAuth.js）
- Markdownエディタでスキルシートを編集・保存
- 閲覧者用の認証コードを設定・変更

### 閲覧者機能
- 認証コード入力でスキルシートを閲覧
- Markdown表示（テーブル、コードブロック対応）
- 自動生成される目次（TOC）機能

### セキュリティ
- パスワード・認証コードはbcryptでハッシュ化
- SSRによる認証チェック（middlewareは不使用）
- 検索エンジンからの除外（noindex）

## 技術スタック

- **フレームワーク**: Next.js 15 (App Router)
- **認証**: NextAuth.js
- **データベース**: PostgreSQL
- **ORM**: Prisma
- **UI**: Material-UI (MUI)
- **Markdown**: react-markdown, rehype-slug, remark-gfm
- **バリデーション**: Zod
- **ハッシュ化**: bcryptjs
- **タスクランナー**: Task (Taskfile)
- **コンテナ**: Docker Compose

## セットアップ手順

### 前提条件

以下がインストールされていること：
- [Task](https://taskfile.dev/#/installation)
- Docker & Docker Compose
- Node.js 23.10.0以上

### 1. 初期化

プロジェクトを初期化します（初回のみ実行）：

```bash
task init
```

このコマンドは以下を実行します：
- `.env`ファイルの生成
- 既存環境のクリーンアップ
- Dockerイメージのビルド
- 依存関係のインストール
- データベースのセットアップ（スキーマ適用 + シードデータ投入）

### 2. 開発サーバーの起動

```bash
task dev
```

http://localhost:3000 にアクセスしてください。

## 初期ログイン情報

シードデータにより、以下の認証情報が使用できます（`.env`ファイルから注入）：

**管理者ログイン** (`/login`)
- ユーザー名: `_DEVELOPER_USERNAME` (デフォルト: `admin`)
- パスワード: `_DEVELOPER_PASSWORD` (デフォルト: `admin123`)

**閲覧者認証** (`/viewer-auth`)
- 認証コード: `_DEVELOPER_VIEWER_CODE` (デフォルト: `view123`)

認証情報は `.env` ファイルで設定できます。詳細は `.env.example` を参照してください。

**⚠️ 本番環境では必ず変更してください**

## ページ構成

- `/` - ルートページ（閲覧者認証ページへリダイレクト）
- `/login` - 管理者ログインページ
- `/admin` - 管理画面（Markdown編集、認証コード管理）
- `/viewer-auth` - 閲覧者認証ページ
- `/view` - スキルシート閲覧ページ

## よく使うタスク

### 開発関連

```bash
# 開発サーバー起動（DBも自動起動）
task dev

# 全サービスをDocker Composeで起動
task up

# サービスを停止
task down

# ログを表示
task logs
```

### データベース関連

```bash
# データベースのセットアップ（初期化時に自動実行済み）
task db:setup

# Prismaスキーマをデータベースに適用
task db:push

# シードデータを投入
task db:seed

# Prisma Studio起動（GUIでDBを確認）
task db:studio

# データベースをリセット（全データ削除 + 再セットアップ）
task db:reset
```

### ビルド・テスト

```bash
# Next.jsアプリケーションをビルド
task build

# テストを実行
task test

# Lintを実行
task lint
```

### クリーンアップ

```bash
# 生成ファイル削除
task clean

# Dockerリソース削除
task docker-clean

# 全て削除（再構築はしない）
task clear
```

### その他

```bash
# 利用可能なタスク一覧を表示
task

# 実行中のコンテナ一覧
task ps

# Prisma Clientを生成
task prisma:generate
```

## Vercelへのデプロイ

### 1. Vercel Postgresのセットアップ

1. Vercelダッシュボードでプロジェクトを開く
2. "Storage"タブから"Create Database"を選択
3. "Postgres"を選択
4. データベース名を入力して作成
5. ".env.local"タブから環境変数をコピー

### 2. 環境変数の設定

Vercelのプロジェクト設定で以下の環境変数を設定：

- `DATABASE_URL` - Vercel Postgresの接続URL
- `NEXTAUTH_URL` - デプロイ先のURL（例：https://your-app.vercel.app）
- `NEXTAUTH_SECRET` - ランダムな秘密鍵

```bash
# NEXTAUTH_SECRETの生成
openssl rand -base64 32
```

### 3. デプロイ

```bash
# Vercel CLIを使用する場合
vercel --prod

# またはGitHubと連携してデプロイ
git push origin main
```

### 4. データベースの初期化

デプロイ後、ローカルで以下を実行：

```bash
DATABASE_URL="your-vercel-postgres-url" npx prisma db push
DATABASE_URL="your-vercel-postgres-url" npx prisma db seed
```

## トラブルシューティング

### データベース接続エラー

```
Error: P1001: Can't reach database server
```

**解決方法：**
```bash
# DBコンテナの状態確認
task ps

# DBコンテナを再起動
task down
task dev
```

### Prismaエラー

```bash
# Prisma Clientを再生成
task prisma:generate

# データベースをリセット
task db:reset
```

### 環境の完全リセット

```bash
# すべてクリーンアップして再初期化
task clear
task init
```

## プロジェクト構成

```
skill-sheet/
├── docker-compose.yaml      # Docker Compose設定
├── taskfile.yaml            # タスク定義
├── prisma/
│   ├── schema.prisma        # データベーススキーマ
│   └── seed.ts              # シードデータ
├── src/
│   ├── app/
│   │   ├── admin/           # 管理画面
│   │   ├── login/           # 管理者ログイン
│   │   ├── viewer-auth/     # 閲覧者認証
│   │   ├── view/            # スキルシート閲覧
│   │   └── api/
│   │       ├── auth/        # NextAuth.js API
│   │       ├── skill-sheet/ # スキルシートAPI
│   │       └── viewer-auth/ # 閲覧者認証API
│   ├── components/
│   │   └── SessionProvider.tsx
│   ├── lib/
│   │   ├── auth.ts          # NextAuth設定
│   │   ├── prisma.ts        # Prismaクライアント
│   │   └── viewer-auth.ts   # 閲覧者認証ヘルパー
│   └── types/
│       └── next-auth.d.ts   # NextAuth型定義
└── .env.example             # 環境変数のテンプレート
```

## セキュリティに関する注意事項

1. **本番環境では必ず以下を変更してください**
   - 管理者のユーザー名とパスワード
   - 閲覧者の認証コード
   - NEXTAUTH_SECRETの値

2. **環境変数の管理**
   - `.env`ファイルはGitにコミットしない
   - `.gitignore`に`.env`が含まれていることを確認

3. **HTTPS の使用**
   - 本番環境では必ずHTTPSを使用してください
   - Vercelは自動的にHTTPSを有効にします

## ライセンス

UNLICENSED

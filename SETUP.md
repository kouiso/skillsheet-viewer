# Engineer Skill Sheet Viewer - セットアップガイド

エンジニアのスキルシートをMarkdown形式で管理し、Web上で見やすく表示するためのアプリケーションです。

## 特徴

- ✅ **データベース不要**: GitHub Private Repositoryにスキルシート（Markdown）を保存
- ✅ **シンプル認証**: 共有コードによる簡単なアクセス制御
- ✅ **自動更新**: GitHubにpushするだけで最新スキルシートを表示
- ✅ **完全プライベート**: GitHub Tokenで認証、不特定多数には見られない
- ✅ **バージョン管理**: Gitのコミット履歴で変更履歴を管理
- ✅ **無料運用**: Vercel + GitHub（無料プラン）で運用可能

## アーキテクチャ

```
Private GitHub Repository
  └── skillsheet.md (Markdownファイル)
        ↓ GitHub API (Personal Access Token)
Next.js Application (Vercel)
  ├── 環境変数
  │   ├── GITHUB_TOKEN
  │   ├── GITHUB_OWNER
  │   ├── GITHUB_REPO
  │   └── VIEWER_CODE (共有認証コード)
  └── /view (スキルシート表示)
```

## セットアップ手順

### 1. Private Repositoryの作成

1. GitHubで新しいPrivate Repositoryを作成
2. `skillsheet.md`ファイルを作成してスキルシートを記載
3. mainブランチにcommit & push

### 2. GitHub Personal Access Tokenの作成

1. GitHub Settings → Developer settings → Personal access tokens → Tokens (classic)
2. "Generate new token (classic)" をクリック
3. 以下の設定：
   - Note: `Skill Sheet Viewer`
   - Expiration: `No expiration` or `90 days`
   - Scopes: `repo` (Full control of private repositories)
4. トークンをコピー（この画面を閉じると二度と表示されません）

### 3. 環境変数の設定

`.env`ファイルを作成し、以下を設定：

\```env
NODE_ENV=development

# Viewer authentication (任意の共有コード)

VIEWER_CODE=your-secret-viewer-code

# GitHub API

GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
GITHUB_OWNER=your-github-username
GITHUB_REPO=your-private-repo-name
GITHUB_FILE_PATH=skillsheet.md
GITHUB_BRANCH=main
\```

### 4. 依存関係のインストール

\```bash
npm install
\```

### 5. 開発サーバーの起動

\```bash
npm run dev
\```

→ http://localhost:3000 にアクセス

### 6. 認証コードの入力

1. `/viewer-auth` に自動リダイレクトされる
2. `VIEWER_CODE`で設定したコードを入力
3. スキルシートが表示される

## Vercelへのデプロイ

### 1. Vercelプロジェクトの作成

\```bash
npm install -g vercel
vercel
\```

### 2. 環境変数の設定

Vercel Dashboard → Settings → Environment Variables で以下を設定：

- `VIEWER_CODE`
- `GITHUB_TOKEN`
- `GITHUB_OWNER`
- `GITHUB_REPO`
- `GITHUB_FILE_PATH`
- `GITHUB_BRANCH`

### 3. デプロイ

\```bash
vercel --prod
\```

## スキルシートの更新方法

1. GitHubのPrivate Repositoryで`skillsheet.md`を編集
2. Commit & Push
3. ブラウザでリロード → 最新スキルシートが表示される

## 運用コスト

- GitHub Private Repository: 無料
- Vercel Hosting: 無料（Hobbyプラン）
- **合計: 完全無料**

## セキュリティ

- GitHub Private Repository: 完全プライベート
- GitHub Token: サーバー側のみで使用、ブラウザには公開されない
- VIEWER_CODE: 共有可能なアクセスコード（URLには含まれない）
- Cookie: HttpOnly, Secure（本番環境）

## トラブルシューティング

### スキルシートが表示されない

1. `.env`の`GITHUB_TOKEN`, `GITHUB_OWNER`, `GITHUB_REPO`が正しいか確認
2. GitHub Tokenの権限が`repo`スコープを含むか確認
3. `skillsheet.md`がリポジトリの指定パスに存在するか確認

### 認証コードが通らない

- `.env`の`VIEWER_CODE`と入力したコードが一致するか確認

### GitHub API Rate Limit

- Personal Access Tokenを使用している場合、5000 requests/hour
- 通常の使用では問題なし

## ライセンス

UNLICENSED

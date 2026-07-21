# Engineer Skill Sheet Viewer

エンジニアのスキルシートを **閲覧・編集・PDF 出力** するための Web アプリケーションです。

スキルシートの正本（データの源）は Neon Postgres に保存します。1 枚のスキルシートは順序付きの「ブロック」の集まりとして持ち、表示時に Markdown へ組み立てて描画します。

## 主な機能

- **閲覧（Viewer）**: スキルシートを Markdown として整形表示。目次（TOC）・アクティブ見出し追従つき
- **編集（Builder）**: 編集者がブロック単位でスキルシートを作成・更新（Better Auth ログインが必要）
- **比較（Compare）**: 2 枚のスキルシートを左右に並べて比較
- **PDF 出力（Export）**: 表示中のスキルシートを PDF として書き出す

## 技術スタック

- **構成**: pnpm workspaces モノレポ（`apps/web` + `packages/db`）
- **言語**: TypeScript
- **フレームワーク**: Next.js 16（App Router / React Server Components）
- **UI**: Tailwind CSS v4 + shadcn/ui（Radix UI）
- **Markdown レンダリング**: react-markdown（remark-gfm / remark-breaks → rehype-raw → rehype-sanitize → rehype-slug）
- **PDF**: @react-pdf/renderer（クライアント側で動的 import）
- **DB / ORM**: Drizzle ORM + Neon serverless Postgres（正本データ源）
- **認証**: Better Auth（編集者ログイン）+ HMAC 署名の閲覧コード（`VIEWER_CODE`）
- **Lint / Format**: Biome
- **テスト**: Vitest
- **ランタイム / パッケージ管理**: mise（Node 22.x）/ pnpm

## モノレポ構成

```
.
├── apps/
│   └── web/                 # Next.js 16 アプリ（App Router）
│       ├── app/             # ルーティング（page.tsx / layout.tsx / route.ts）
│       └── src/
│           ├── component/   # 機能コンポーネント（Markdown ビューア・PDF 等）
│           ├── components/  # shadcn/ui ベースの UI 部品
│           ├── context/     # React Context
│           ├── hooks/       # カスタムフック
│           ├── lib/         # 認証クライアント・環境変数検証など
│           ├── server/      # サーバー専用ロジック（認証ゲート・セッション・キャッシュ）
│           └── util/        # ユーティリティ関数
└── packages/
    └── db/                  # Drizzle ORM + Neon（スキルシートの正本 / Better Auth テーブル）
```

## クイックスタート

すべてのコマンドはリポジトリルートで実行します。

```bash
# 1. ランタイムの用意（mise で Node 22.x を固定 / pnpm を有効化）
mise install
corepack enable

# 2. 依存インストール
pnpm install

# 3. 環境変数を設定（.env.example をコピーして値を埋める）
cp .env.example .env
#   最低限: DATABASE_URL / SESSION_SECRET / VIEWER_CODE / BETTER_AUTH_SECRET / SKILLSHEET_OWNER_ID

# 4. DB マイグレーションを適用（Neon Postgres が必要）
pnpm db:migrate

# 5. 開発サーバー起動（http://localhost:3000）
pnpm dev
```

詳細な手順・環境変数・デプロイは [SETUP.md](./SETUP.md) を参照してください。

### アクセス経路

- 閲覧のみ: `/viewer-auth` で閲覧コード（`VIEWER_CODE`）を入力
- 編集: `/login` で編集者（Better Auth）ログイン → `/builder`

## 主要コマンド

| コマンド | 説明 |
|---------|------|
| `pnpm dev` | 開発サーバー起動（`apps/web`） |
| `pnpm build` | 本番ビルド |
| `pnpm start` | ビルド後のサーバー起動 |
| `pnpm lint` | Biome でチェック（`biome check .`） |
| `pnpm format` | Biome でフォーマット（`biome format --write .`） |
| `pnpm -r type-check` | 全パッケージの型チェック |
| `pnpm -r --if-present test` | 全テスト（Vitest） |
| `pnpm test:e2e` | 本番ビルドを Chrome/Chromium で検証し、`test-results/e2e/` に証跡を保存 |
| `pnpm db:generate` | スキーマからマイグレーション生成（Drizzle） |
| `pnpm db:migrate` | マイグレーション適用 |

## ドキュメント

### 新メンバー向け

- [doc/onboarding.md](./doc/onboarding.md) — セットアップとアプリ起動
- [doc/dev-guide.md](./doc/dev-guide.md) — 開発ガイドとコーディング規約

### 実装解説

| ドキュメント | 内容 |
|------------|------|
| [doc/01_setup_and_routing.md](./doc/01_setup_and_routing.md) | セットアップとルーティング（App Router / RSC / モノレポ） |
| [doc/02_authentication.md](./doc/02_authentication.md) | 認証の 2 系統（Better Auth 編集者 & HMAC 閲覧コード） |
| [doc/03_github_api.md](./doc/03_github_api.md) | データ層（Drizzle / Neon、ブロック保存、GitHub シード副系統） |
| [doc/04_markdown_display.md](./doc/04_markdown_display.md) | Markdown 表示（rehype パイプライン）と PDF 出力 |
| [doc/05_toc_and_deploy.md](./doc/05_toc_and_deploy.md) | 目次（TOC / アクティブ見出し）と Vercel デプロイ |

## ライセンス

UNLICENSED

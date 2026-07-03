# 開発ガイド

すべてのコマンドはリポジトリルートで実行します（pnpm workspaces モノレポ）。

## コマンド

### 開発

- `pnpm dev` - 開発サーバーを起動（`apps/web`）
- `pnpm build` - 本番用ビルドを実行
- `pnpm start` - ビルド後のサーバーを起動

### テスト

- `pnpm test` - 全パッケージのテストを実行（vitest）
- `pnpm --filter @skillsheet/web test:watch` - 監視モードでテスト実行
- `pnpm --filter @skillsheet/web test:coverage` - カバレッジ付きでテスト実行

### コード品質

- `pnpm lint` - Biome でコードをチェック（`biome check`）
- `pnpm format` - Biome でフォーマット（`biome format --write`）
- `pnpm -r type-check` - TypeScript 型チェック（全パッケージ）

### DB（Drizzle）

- `pnpm db:generate` - スキーマからマイグレーションを生成
- `pnpm db:migrate` - マイグレーションを適用

## プロジェクト構成

```
.
├── apps/
│   └── web/                 # Next.js 16 アプリ（App Router）
│       ├── app/             # ルーティング（App Router: page.tsx / layout.tsx / route.ts）
│       └── src/
│           ├── component/   # 機能コンポーネント（PDF 含む）
│           ├── components/  # shadcn/ui ベースの UI 部品
│           ├── context/     # React Context
│           ├── hooks/       # カスタムフック
│           ├── lib/         # 認証クライアントなどの共通設定
│           ├── server/      # サーバー専用ロジック（認証ゲート・セッション）
│           └── util/        # ユーティリティ関数
└── packages/
    └── db/                  # Drizzle ORM + Neon（スキルシートの正本）
```

## コーディング規約

### ファイル・ディレクトリ

- ファイル名・ディレクトリ名は英語小文字のケバブケースで統一
- サーバー専用モジュール（`apps/web/src/server` や `packages/db`）は Client Component から import しない

### TypeScript

- 明示的な型定義を推奨
- `as` による型アサーションは必要最小限に留める

### React / Next.js

- App Router 前提。サーバーで完結する処理は React Server Components 側に置く
- クライアント側でのみ必要なもの（PDF レンダリング等）は動的 import を使う
- 関数コンポーネントを使用し、ロジックはカスタムフックへ分離

### スタイリング

- Tailwind CSS v4 + shadcn/ui（Radix UI）を使用
- 共通 UI 部品は `apps/web/src/components/ui` に集約

## Markdown レンダリング

### react-markdown

- スキルシートはブロック列を Markdown に組み立てて react-markdown で表示
- GitHub Flavored Markdown 相当の記法に対応

## PDF 出力

- `@react-pdf/renderer` を使用
- バンドルサイズと SSR の都合上、クライアント側で動的 import する

## 認証

詳細は `prompt/prompt.md` の「認証の2系統設計」を参照。

- 編集者ログイン: Better Auth（`apps/web/src/lib/auth.ts` / `server/auth-gate.ts`）
- 閲覧コード: HMAC + VIEWER_CODE（`server/session.ts` / `server/viewer-gate.ts`）

## デバッグ

### Next.js の Fast Refresh

開発サーバー起動中はファイル保存時に自動で再描画されます。

### ブラウザ開発者ツール

- React Developer Tools でコンポーネント構造を確認
- Network タブで API 通信を監視

## トラブルシューティング

### ビルド・依存エラー

1. `node_modules` を削除して再インストール

   ```bash
   rm -rf node_modules apps/web/node_modules packages/db/node_modules
   pnpm install
   ```

2. 型エラーの切り分け

   ```bash
   pnpm -r type-check
   ```

### スキルシートが表示されない

- `DATABASE_URL` が正しく設定されているか確認
- マイグレーションが適用済みか確認（`pnpm db:migrate`）
- 閲覧時は `VIEWER_CODE` による HMAC 閲覧用セッションが有効か確認

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

- ファイル名・ディレクトリ名は **英語・小文字・単数形・ケバブケース** で統一する
  （例: `project-card.tsx` / `tech-filter.test.tsx` / `01-setup-and-routing.md`）
- React コンポーネントのファイルも例外ではない。中の関数名は `ProjectCard` でも、
  ファイル名は `project-card.tsx`
- TypeScript 以外の言語を足す場合は、その言語で最も標準的な流儀に合わせる
  （Python なら `snake_case.py` 等）
- 例外はツール・フレームワークが名前を規定しているものだけ。現時点では
  Next.js の動的ルート（`[id]`）、drizzle の生成物、`README.md` 等の全大文字慣習、
  ドットファイル、配布フォント・素材の原名
- **この規約は `scripts/check-naming.sh` が機械的に検査する。**
  `task naming` でローカル確認でき、CI（`.github/workflows/ci.yml` の naming ジョブ）でも必ず走る。
  例外を増やすときは同スクリプトの `is_exempt()` に理由付きで追加する（無言で足さない）
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

## 依存の脆弱性対応

CI（`.github/workflows/security-scan.yml`）は `pnpm audit` を2本走らせ、**high 以上**でビルドを落とす。
1本目は本番依存のみ、2本目は devDependencies も含む。

直接依存の更新で直せない推移的依存は、ルート `package.json` の `pnpm.overrides` で寄せる。
現在入っている override とその理由は次の通り。上流が追いついたら削除してよい。

| override | 理由 |
| --- | --- |
| `postcss: ^8.5.23` | `next` が `postcss` を `8.4.31` で完全固定するため、next を上げても GHSA-6g55-p6wh-862q / GHSA-r28c-9q8g-f849 が残る |
| `sharp: ^0.35.3` | `next` の optionalDependencies が `^0.34.5` で GHSA-f88m-g3jw-g9cj の修正版 0.35.0 に届かない。本アプリは `next/image` を使っていないため影響範囲は画像最適化のみ |
| `brace-expansion@>=3: ^5.0.8` | GHSA-mh99-v99m-4gvg の修正版。5.x 系のみに適用する |
| `test-exclude: ^8.0.0` | 7.x は minimatch 9 → brace-expansion 2.x を引き、2.x 系には GHSA-mh99-v99m-4gvg の修正版が無い。8.0.0 は minimatch 10 → brace-expansion 5 になる |
| `fast-uri@3: ^3.1.4` | GHSA-v2hh-gcrm-f6hx / GHSA-4c8g-83qw-93j6 |

`brace-expansion` を全系統まとめて `^5.0.8` に寄せてはいけない。5.x は
`require('brace-expansion')` の戻り値が関数から object に変わる破壊的変更を含み、
それを関数として呼ぶ minimatch 3.x / 9.x が壊れる。系統ごとに範囲を切って指定する。

### Storybook のビルダー

Storybook のフレームワークは `@storybook/nextjs-vite` を使う。webpack 版の
`@storybook/nextjs` は `fork-ts-checker-webpack-plugin` を経由して minimatch 3.x を引き、
その先の brace-expansion 1.x に修正版が存在しないため CI の2本目を落とす。
`@storybook/addon-essentials` は Storybook 9 以降で本体に統合され 10 系が存在しないので、
addons へ書かない。ただし docs だけは統合されず `@storybook/addon-docs` として残っている。
story の `tags: ['autodocs']` はこれを addons に入れないとドキュメントページを生成しない。
生成されているかは `storybook build` 後の `storybook-static/index.json` に
`"type": "docs"` の項目があるかで確認できる。

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

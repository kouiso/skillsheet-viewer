# 開発ガイド

すべてのコマンドはリポジトリルートで実行します（pnpm workspaces モノレポ）。

## コマンド

### 開発

- `pnpm dev` - 開発サーバーを起動
- `pnpm build` - 本番用ビルドを実行
- `pnpm start` - ビルド後のサーバーを起動

### テスト

- `pnpm test` - 全パッケージのテストを実行（vitest）
- `pnpm test:watch` - 監視モードでテスト実行
- `pnpm test:coverage` - カバレッジ付きでテスト実行

### コード品質

- `pnpm lint` - Biome でコードをチェック（`biome check`）
- `pnpm format` - Biome でフォーマット（`biome format --write`）
- `pnpm type-check` - TypeScript 型チェック（全パッケージ）

### DB（Drizzle）

- `pnpm db:generate` - スキーマからマイグレーションを生成
- `pnpm db:migrate` - マイグレーションを適用

## プロジェクト構成

リポジトリルートがそのまま Next.js のプロジェクトルート（パッケージは1つだけ）。

```
.
├── app/                 # ルーティング（App Router: page.tsx / layout.tsx / route.ts）
├── src/
│   ├── components/      # コンポーネント（PDF 含む）
│   │   └── ui/          # shadcn/ui ベースの UI 部品
│   ├── context/         # React Context
│   ├── db/              # Drizzle ORM + Neon（スキルシートの正本）
│   ├── hooks/           # カスタムフック
│   ├── lib/             # 認証クライアント・tRPC クライアントなどの共通設定
│   ├── server/          # サーバー専用ロジック（認証ゲート・セッション・tRPC router）
│   │   └── trpc/        # tRPC: context / init / router / server caller
│   └── util/            # ユーティリティ関数
├── drizzle/             # マイグレーション（drizzle.config.ts はルート）
├── e2e/                 # Playwright の E2E
├── scripts/             # CLI スクリプトと CI 用チェッカー
└── public/              # 静的ファイル（フォント等）
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
- サーバー専用モジュール（`src/server` や `src/db`）は Client Component から import しない

### TypeScript

- 明示的な型定義を推奨
- `as` による型アサーションは必要最小限に留める

### React / Next.js

- App Router 前提。サーバーで完結する処理は React Server Components 側に置く
- クライアント側でのみ必要なもの（PDF レンダリング等）は動的 import を使う
- 関数コンポーネントを使用し、ロジックはカスタムフックへ分離

### スタイリング

- Tailwind CSS v4 + shadcn/ui（Radix UI）を使用
- 共通 UI 部品は `src/components/ui` に集約

## Markdown レンダリング

### react-markdown

- スキルシートはブロック列を Markdown に組み立てて react-markdown で表示
- GitHub Flavored Markdown 相当の記法に対応

## PDF 出力

- `@react-pdf/renderer` を使用
- バンドルサイズと SSR の都合上、クライアント側で動的 import する

## 認証

詳細は `prompt/prompt.md` の「認証の2系統設計」を参照。

- 編集者ログイン: Better Auth（`src/lib/auth.ts` / `server/auth-gate.ts`）
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
| `brace-expansion@>=3: ^5.0.9` | GHSA-mh99-v99m-4gvg の修正版。3.0.0 以上にだけ適用する。5.0.8 は GHSA-mh99-v99m-4gvg の緩和が不完全で別途 GHSA-rgw5-rvv9-x895（CVE-2026-69152）の対象になるため 5.0.9 まで上げる |
| `test-exclude: ^8.0.0` | 7.x は minimatch 9 → brace-expansion 2.x を引き、2.x 系には GHSA-mh99-v99m-4gvg の修正版が無い。8.0.0 は minimatch 10 → brace-expansion 5 になる |
| `fast-uri@3: ^3.1.5` | GHSA-v2hh-gcrm-f6hx / GHSA-4c8g-83qw-93j6。3.1.4 は別途 GHSA-7p8r-x3mc-p8w7（CVE-2026-18446）の対象になるため 3.1.5 まで上げる |

`brace-expansion` を全系統まとめて `^5.0.8` に寄せてはいけない。`require('brace-expansion')`
の戻り値は 3.0.0 で関数から object へ変わっており、それを関数として呼ぶ minimatch 3.x / 9.x が
壊れるため。境界を `>=3` に置いているのはこの変更点に合わせたもので、5.x に絞ると
3.x / 4.x が来たときに修正版へ寄らなくなる。実測値は次の通り。

| version | `require()` の戻り値 |
| --- | --- |
| 1.1.16 / 2.1.2 | function |
| 3.0.2 / 4.0.1 | object（`default` 経由） |
| 5.0.8 / 5.0.9 | object（`expand` 経由） |

3.x / 4.x と 5.x も取り出し方が違うので、3.x / 4.x を要求する依存が新しく入ってきた場合は
この override が原因で読み込みに失敗する。現在のロックファイルに 3.x / 4.x は無く、
`brace-expansion` は 5.0.9 の1個だけなので実害は無い。落ちる場合も起動時にエラーが出る。
その時は override を狭めるのではなく、依存側を上げる。狭めると脆弱性検査が赤くなる。

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
   rm -rf node_modules
   pnpm install
   ```

2. 型エラーの切り分け

   ```bash
   pnpm type-check
   ```

### スキルシートが表示されない

- `DATABASE_URL` が正しく設定されているか確認
- マイグレーションが適用済みか確認（`pnpm db:migrate`）
- 閲覧時は `VIEWER_CODE` による HMAC 閲覧用セッションが有効か確認

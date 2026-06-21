# 開発ガイド

## コマンド

### 開発

- `pnpm dev` - 開発サーバーを起動
- `pnpm build` - 本番用ビルドを実行
- `pnpm start` - ビルド後の本番サーバーを起動

### テスト

- `pnpm test` - テストを実行
- `pnpm --filter @skillsheet/web test:watch` - 監視モードでテストを実行
- `pnpm --filter @skillsheet/web test:coverage` - カバレッジレポート付きでテスト実行

### コード品質

- `pnpm lint` - Biome でコードをチェック
- `pnpm type-check` - TypeScript 型チェック

## プロジェクト構成

```
apps/web/
├── app/           # Next.js App Router（ページ・レイアウト・API Route）
├── src/components/ # Reactコンポーネント
├── src/hooks/      # カスタムフック
├── src/util/       # ユーティリティ関数
└── src/lib/        # 外部ライブラリの設定
```

## コーディング規約

### ファイル・ディレクトリ

- コンポーネントファイルは PascalCase で命名
- ユーティリティファイルは camelCase で命名
- 1 ファイル 1 コンポーネントを原則とする

### TypeScript

- 明示的な型定義を推奨
- `as` による型アサーションは必要最小限に留める

### React

- 関数コンポーネントを使用
- カスタムフックを活用してロジックを分離
- Props の型定義を必ず行う

## Markdown レンダリング

### react-markdown

- GitHub Flavored Markdown (GFM) をサポート
- `remark-gfm` プラグインでテーブル、タスクリスト等に対応
- `rehype-slug` で見出しに自動的に ID を付与

### カスタムスタイリング

shadcn/ui と Tailwind CSS のデザイントークンに合わせてスタイルをカスタマイズ可能

## デバッグ

### Next.js の Fast Refresh

開発サーバー起動中はファイル保存時に自動でページが更新されます

### ブラウザ開発者ツール

- React Developer Tools を使用してコンポーネント構造を確認
- Network タブで GitHub API 通信を監視

## トラブルシューティング

### ビルドエラー

1. `node_modules` を削除して再インストール

   ```bash
   rm -rf node_modules pnpm-lock.yaml
   pnpm install
   ```

2. TypeScript のキャッシュをクリア
   ```bash
   pnpm build
   ```

### Markdown が表示されない

- GitHub のリポジトリ URL が正しいか確認
- ネットワークタブで API リクエストが成功しているか確認
- CORS エラーが発生していないか確認

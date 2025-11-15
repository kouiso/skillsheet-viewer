# 開発ガイド

## コマンド

### 開発

- `npm run dev` - 開発サーバーを起動
- `npm run build` - 本番用ビルドを実行
- `npm run preview` - ビルド後のプレビューサーバーを起動

### テスト

- `npm test` - テストを実行
- `npm run test:watch` - 監視モードでテストを実行
- `npm run test:coverage` - カバレッジレポート付きでテスト実行

### コード品質

- `npm run lint` - ESLint でコードをチェック
- `npm run lint:type` - TypeScript 型チェック

## プロジェクト構成

```
src/
├── components/     # Reactコンポーネント
├── pages/         # ページコンポーネント
├── hooks/         # カスタムフック
├── utils/         # ユーティリティ関数
├── types/         # TypeScript型定義
└── lib/           # 外部ライブラリの設定
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

Material-UI のテーマに合わせてスタイルをカスタマイズ可能

## デバッグ

### Vite の Hot Module Replacement (HMR)

開発サーバー起動中はファイル保存時に自動でページがリロードされます

### ブラウザ開発者ツール

- React Developer Tools を使用してコンポーネント構造を確認
- Network タブで GitHub API 通信を監視

## トラブルシューティング

### ビルドエラー

1. `node_modules` を削除して再インストール

   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```

2. TypeScript のキャッシュをクリア
   ```bash
   npm run build
   ```

### Markdown が表示されない

- GitHub のリポジトリ URL が正しいか確認
- ネットワークタブで API リクエストが成功しているか確認
- CORS エラーが発生していないか確認

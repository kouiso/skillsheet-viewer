# ONBOARDING

チームにジョインしてアプリケーションを立ち上げるところまで

## prerequisite

セットアップとその後の開発に必要な依存をインストール

- Machine: MacOS or Windows WSL2
- NodeJS: v22.x

<details>
<summary>複数のnodeバージョン管理</summary>

※複数の node バージョン管理が必要な場合は各自バージョン管理ツールを導入して管理する
まだ未導入であればプラグイン式で全言語の環境管理ができる[asdf](https://asdf-vm.com/guide/getting-started.html#_3-install-asdf)がおすすめ

```bash
# リンク先の手順に従って手動インストール後、以下を実行

# バージョン管理
asdf plugin-add nodejs
asdf install nodejs 22.0.0
# (プロジェクトディレクトリ直下で実行)
asdf local nodejs 22.0.0
# Globalに適用したい場合は以下
# asdf global nodejs 22.0.0
```

</details>

## 初回設定

### 環境変数

基本的に環境変数の設定は不要です。
GitHub のスキルシート用リポジトリから Markdown ファイルを取得して表示します。

## セットアップ手順

1. **依存パッケージのインストール**

   ```bash
   npm install
   ```

2. **開発サーバーの起動**

   ```bash
   npm run dev
   ```

   - ローカル環境で開発サーバーが起動します
   - デフォルトでは `http://localhost:5173` でアクセス可能

3. **ビルド**

   ```bash
   npm run build
   ```

   - 本番用にアプリケーションをビルドします
   - TypeScript のコンパイルと Vite のビルドを実行

## テスト

```bash
npm test              # テスト実行
npm run test:watch    # 監視モードでテスト実行
npm run test:coverage # カバレッジ付きでテスト実行
```

## 技術スタック

- **フレームワーク**: React 19 + Vite
- **言語**: TypeScript 5.7
- **UI ライブラリ**: Material-UI (MUI)
- **ルーティング**: React Router v7
- **Markdown**: react-markdown + remark-gfm
- **テスト**: Vitest

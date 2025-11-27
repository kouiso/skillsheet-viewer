# Day 1: 環境構築とアプリの骨格作成

## 🎯 今日の学習目標

| 学習目標 | 実務での活用場面 | 習得レベル |
|---------|---------------|----------|
| **開発環境の構築** | あらゆるWebアプリ開発の初期設定 | ✅ 開発環境を整えられる |
| **Viteプロジェクトの作成** | モダンなReactアプリの立ち上げ | ✅ Viteで新規プロジェクトを作成できる |
| **Material-UIの導入** | UIコンポーネントライブラリの活用 | ✅ Material-UIをプロジェクトに導入できる |
| **React Routerの設定** | ページ遷移の実装 | ✅ ルーティングを設定できる |
| **認証フォームのUI作成** | フォームUIの実装 | ✅ Material-UIでフォームを作成できる |

## 💼 なぜこれを学ぶのか?

**例え話: 家を建てる前の基礎工事**

アプリ開発は家を建てることに似ています。今日は「基礎工事」の日です。土台がしっかりしていないと、後から問題が出てきます。環境構築、プロジェクトの骨格、ルーティング、そして認証画面のUIまで作ることで、明日からスムーズに機能を追加していけます。

## 📊 実装ステップ一覧

| パート | 内容 | ステップ数 | 所要時間 |
|--------|------|-----------|----------|
| **Part 1** | 開発環境の準備 | 2ステップ | 20分 |
| **Part 2** | Viteプロジェクトの作成 | 3ステップ | 25分 |
| **Part 3** | Material-UIとReact Routerの導入 | 2ステップ | 20分 |
| **Part 4** | アプリの骨格とルーティング | 2ステップ | 30分 |
| **Part 5** | 認証フォームのUI作成 | 2ステップ | 35分 |
| **合計** | - | **11ステップ** | **約2.5時間** |

**今日作成するファイル:**
- `main.tsx` (11行)
- `app.tsx` (27行)
- `viewer-auth.tsx` 前半 (約50行)

**今日のコード量: 約88行**

---

## 実装内容

### Part 1: 開発環境の準備(20分)

#### Step 1.1: Node.jsのバージョン確認(所要時間:5分)

**このステップで学ぶこと**: Node.jsが正しくインストールされているか確認します

**確認方法**:

ターミナルを開き、以下のコマンドを実行:

```bash
node --version
```

**期待される結果**:
```
v22.0.0
```
または、`v22`以上のバージョンが表示されればOKです。

**もしNode.jsがインストールされていない場合**:
1. [Node.js公式サイト](https://nodejs.org/)にアクセス
2. 「LTS版」(推奨版)をダウンロード
3. インストーラーの指示に従ってインストール

#### Step 1.2: VS Codeのインストール確認(所要時間:15分)

**このステップで学ぶこと**: コードエディタを準備します

**確認とインストール**:

1. [VS Code公式サイト](https://code.visualstudio.com/)からダウンロード
2. インストール後、以下の拡張機能をインストール:

**推奨拡張機能**:
- ES7+ React/Redux/React-Native snippets
- ESLint
- Prettier - Code formatter
- TypeScript Import Sorter

---

### Part 2: Viteプロジェクトの作成(25分)

#### Step 2.1: プロジェクトの作成(所要時間:10分)

**このステップで学ぶこと**: Viteを使って新しいReactプロジェクトを作成します

**コマンドの実行**:

```bash
npm create vite@latest skillsheet-viewer -- --template react-ts
```

**コマンドの説明**:
- `npm create vite@latest`: 最新のViteプロジェクトを作成
- `skillsheet-viewer`: プロジェクト名
- `-- --template react-ts`: React + TypeScriptのテンプレート

#### Step 2.2: 依存パッケージのインストール(所要時間:5分)

プロジェクトディレクトリに移動して、パッケージをインストール:

```bash
cd skillsheet-viewer
npm install
```

#### Step 2.3: 開発サーバーの起動確認(所要時間:10分)

開発サーバーを起動して動作確認:

```bash
npm run dev
```

ブラウザで `http://localhost:5173/` を開いて、Viteのデフォルトページが表示されればOKです。

確認できたら `Ctrl + C` でサーバーを停止します。

---

### Part 3: Material-UIとReact Routerの導入(20分)

#### Step 3.1: 必要なパッケージのインストール(所要時間:10分)

**このステップで学ぶこと**: Material-UIとReact Routerをインストールします

```bash
npm install @mui/material @emotion/react @emotion/styled @mui/icons-material react-router-dom
```

**パッケージの説明**:
- `@mui/material`: Material-UIのコアコンポーネント
- `@emotion/react`, `@emotion/styled`: CSS-in-JSライブラリ
- `@mui/icons-material`: アイコン集
- `react-router-dom`: ルーティングライブラリ

#### Step 3.2: プロジェクト構造の準備(所要時間:10分)

**このステップで学ぶこと**: プロジェクトのフォルダ構成を整えます

VS Codeでプロジェクトを開き、`src`フォルダ内に以下のフォルダを作成:

```bash
src/
├── page/      # ページコンポーネント
├── component/ # 再利用可能なコンポーネント
├── lib/       # ライブラリ設定
├── type/      # TypeScript型定義
└── util/      # ユーティリティ関数
```

VS Codeのエクスプローラーで右クリック → 「New Folder」で作成できます。

---

### Part 4: アプリの骨格とルーティング(30分)

#### Step 4.1: main.tsxの作成(所要時間:10分)

**このステップで学ぶこと**: Reactアプリのエントリーポイントを作成します

**ファイル**: `src/main.tsx`

既存の`main.tsx`を以下の内容に置き換えます:

```tsx
import { StrictMode } from 'react';

import { createRoot } from 'react-dom/client';

import App from './app';

createRoot(document.querySelector('#root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

**コードの説明**:

| 部分 | 説明 |
|-----|------|
| `createRoot` | React 18+の新しいルート作成API |
| `document.querySelector('#root')!` | HTMLの`id="root"`要素を取得 |
| `!` | TypeScriptの非nullアサーション |
| `StrictMode` | 開発時の警告を有効にする |

#### Step 4.2: app.tsxの作成(所要時間:20分)

**このステップで学ぶこと**: アプリケーションのルートコンポーネントとルーティングを設定します

**ファイル**: `src/app.tsx`

```tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

import { ThemeProvider, createTheme, CssBaseline } from '@mui/material';

import ViewerAuth from './page/viewer-auth';

const theme = createTheme({
  palette: {
    mode: 'light',
  },
});

const App = () => (
  <ThemeProvider theme={theme}>
    <CssBaseline />
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/viewer-auth" replace />} />
        <Route path="/viewer-auth" element={<ViewerAuth />} />
      </Routes>
    </BrowserRouter>
  </ThemeProvider>
);

export default App;
```

**コードの詳細解説**:

**1. テーマの作成**:
```tsx
const theme = createTheme({
  palette: {
    mode: 'light',
  },
});
```
- Material-UIのテーマを作成
- `mode: 'light'`: ライトモード

**2. ルーティング設定**:
```tsx
<Routes>
  <Route path="/" element={<Navigate to="/viewer-auth" replace />} />
  <Route path="/viewer-auth" element={<ViewerAuth />} />
</Routes>
```

| パス | 動作 |
|-----|------|
| `/` | `/viewer-auth`にリダイレクト |
| `/viewer-auth` | ViewerAuthページを表示 |

**3. ThemeProvider**:
```tsx
<ThemeProvider theme={theme}>
```
- アプリ全体にテーマを適用

**4. CssBaseline**:
```tsx
<CssBaseline />
```
- ブラウザのデフォルトスタイルをリセット

---

### Part 5: 認証フォームのUI作成(35分)

#### Step 5.1: 認証ページの基本構造(所要時間:15分)

**このステップで学ぶこと**: 認証ページのUIを作成します(ロジックは明日実装)

**ファイル**: `src/page/viewer-auth.tsx`

```tsx
import { Box, Button, Card, CardContent, TextField, Typography } from '@mui/material';

const ViewerAuthPage = () => {
  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        backgroundColor: '#f5f5f5',
      }}
    >
      <Card sx={{ minWidth: 400, maxWidth: 500 }}>
        <CardContent sx={{ p: 4 }}>
          <Typography variant="h4" component="h1" gutterBottom align="center">
            エンジニアスキルシート閲覧
          </Typography>
          <Typography variant="body2" color="text.secondary" align="center" sx={{ mb: 4 }}>
            共有された認証コードを入力してください
          </Typography>

          <form>
            <TextField
              fullWidth
              label="認証コード"
              margin="normal"
              required
              autoComplete="off"
            />
            <Button
              fullWidth
              type="submit"
              variant="contained"
              size="large"
              sx={{ mt: 3, py: 1.5 }}
            >
              認証
            </Button>
          </form>
        </CardContent>
      </Card>
    </Box>
  );
};

export default ViewerAuthPage;
```

**コードの説明**:

**1. レイアウトコンテナ(Box)**:
```tsx
<Box
  sx={{
    display: 'flex',
    justifyContent: 'center',  // 水平方向中央
    alignItems: 'center',      // 垂直方向中央
    minHeight: '100vh',        // 画面いっぱい
    backgroundColor: '#f5f5f5',
  }}
>
```
- Flexboxで中央配置
- `100vh`: ビューポートの高さいっぱい

**2. カード(Card)**:
```tsx
<Card sx={{ minWidth: 400, maxWidth: 500 }}>
```
- 最小幅400px、最大幅500px
- Material-UIのカードコンポーネント

**3. タイトル(Typography)**:
```tsx
<Typography variant="h4" component="h1" gutterBottom align="center">
```
- `variant="h4"`: h4のスタイル
- `component="h1"`: HTMLタグはh1
- `gutterBottom`: 下に余白
- `align="center"`: 中央揃え

**4. テキストフィールド(TextField)**:
```tsx
<TextField
  fullWidth          // 幅いっぱい
  label="認証コード"  // ラベル
  margin="normal"    // 上下に余白
  required           // 必須項目
  autoComplete="off" // オートコンプリート無効
/>
```

**5. ボタン(Button)**:
```tsx
<Button
  fullWidth
  type="submit"       // フォーム送信ボタン
  variant="contained"  // 塗りつぶしスタイル
  size="large"        // 大きいサイズ
  sx={{ mt: 3, py: 1.5 }}  // margin-top, padding-y
>
```

#### Step 5.2: 動作確認(所要時間:20分)

**このステップで学ぶこと**: 作成したアプリを確認します

**手順**:

1. **開発サーバーを起動**:
```bash
npm run dev
```

2. **ブラウザで確認**:
`http://localhost:5173/` にアクセス

**期待される動作**:
- ✅ `/viewer-auth` にリダイレクトされる
- ✅ 認証フォームが中央に美しく表示される
- ✅ タイトルと説明文が表示される
- ✅ テキストフィールドとボタンがある
- ⚠️ ボタンをクリックしてもまだ何も起こらない(明日実装)

**トラブルシューティング**:

| エラー | 原因 | 対処法 |
|-------|------|-------|
| `Cannot find module './page/viewer-auth'` | ファイルが作成されていない | `src/page/viewer-auth.tsx`を作成 |
| `Cannot find module './app'` | app.tsxが作成されていない | `src/app.tsx`を作成 |
| Material-UIのエラー | パッケージがインストールされていない | `npm install`を再実行 |

---

## 🎓 今日学んだこと

### 重要な概念

1. **Vite**: 次世代フロントエンドビルドツール
   - 高速な開発サーバー
   - Hot Module Replacement (HMR)

2. **React Router**: ページ遷移の管理
   - `BrowserRouter`: ブラウザのURLを使用
   - `Routes`, `Route`: ルート定義
   - `Navigate`: リダイレクト

3. **Material-UI**: UIコンポーネントライブラリ
   - `ThemeProvider`: テーマの適用
   - `Box`, `Card`, `TextField`, `Button`などのコンポーネント
   - `sx`プロパティ: インラインスタイリング

4. **React コンポーネント**: UIの部品
   - アロー関数で定義
   - TSXでマークアップ
   - export/importで再利用

### 技術用語

| 用語 | 意味 |
|-----|------|
| **Vite** | 高速なビルドツール |
| **React Router** | ルーティングライブラリ |
| **Material-UI** | UIコンポーネントライブラリ |
| **TSX** | TypeScript + XML(HTMLのような記法) |
| **Flexbox** | CSSのレイアウト手法 |

### 作成したファイル

```
src/
├── main.tsx           (11行) - エントリーポイント
├── app.tsx            (27行) - ルーティング設定
└── page/
    └── viewer-auth.tsx (50行) - 認証ページのUI
```

**合計: 88行**

---

## ✅ 確認問題

1. **Viteを使うメリットは何ですか?**
   <details>
   <summary>回答を見る</summary>
   従来のビルドツールより高速で、開発サーバーの起動が速く、ファイル変更時の反映も即座に行われます(HMR)。
   </details>

2. **React Routerの役割は何ですか?**
   <details>
   <summary>回答を見る</summary>
   URLに応じて異なるコンポーネント(ページ)を表示する仕組みを提供します。シングルページアプリケーション(SPA)でページ遷移を実現できます。
   </details>

3. **Material-UIのsxプロパティの役割は?**
   <details>
   <summary>回答を見る</summary>
   コンポーネントに直接スタイルを適用するためのプロパティです。CSSをJavaScriptオブジェクトとして記述できます。
   </details>

---

## 🚀 次のステップ

明日(Day 2)は、認証機能のロジックを実装します!

**明日学ぶこと**:
- ✅ React Hooks (useState, useEffect)
- ✅ フォーム処理
- ✅ sessionStorage
- ✅ ページ保護

**明日のコード量: 約104行**

---

## 📚 参考資料

- [Vite公式ドキュメント](https://vitejs.dev/)
- [React公式ドキュメント](https://react.dev/)
- [Material-UI公式ドキュメント](https://mui.com/)
- [React Router公式ドキュメント](https://reactrouter.com/)

---

お疲れ様でした! 🎉
今日でアプリの骨格とUIが完成しました。明日は認証機能を動かしていきます!

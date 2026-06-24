# Day 2: 認証機能の実装とページ保護

## 🎯 今日の学習目標

| 学習目標 | 実務での活用場面 | 習得レベル |
|---------|---------------|----------|
| **React Hooksの理解** | State管理と副作用の処理 | ✅ useState、useEffectを使用できる |
| **フォーム処理** | ユーザー入力の受け付け | ✅ フォーム送信を処理できる |
| **sessionStorageの活用** | セッション情報の管理 | ✅ sessionStorageを使って認証状態を管理できる |
| **環境変数の設定** | 機密情報の安全な管理 | ✅ 環境変数を設定・使用できる |
| **ページ保護の実装** | 未認証アクセスの制御 | ✅ 認証が必要なページを保護できる |

## 💼 なぜこれを学ぶのか?

**例え話: 会員証で入場管理**

認証は、イベント会場での「会員証チェック」のようなものです。正しい会員証を持っている人だけが入場でき、会員証がない人は受付で発行してもらう必要があります。

今日は、昨日作成した認証フォームに実際のロジックを追加し、正しい認証コードを入力した人だけがスキルシートを閲覧できるようにします。

## 📊 実装ステップ一覧

| パート | 内容 | ステップ数 | 所要時間 |
|--------|------|-----------|----------|
| **Part 1** | React Hooksの理解 | 2ステップ | 25分 |
| **Part 2** | 環境変数の設定 | 2ステップ | 20分 |
| **Part 3** | 認証ロジックの実装 | 2ステップ | 40分 |
| **Part 4** | ページ保護の実装 | 2ステップ | 45分 |
| **Part 5** | 動作確認 | 1ステップ | 20分 |
| **合計** | - | **9ステップ** | **約2.5-3時間** |

**今日作成・更新するファイル:**
- `viewer-auth.tsx` 後半 (約47行追加)
- `view.tsx` 前半 (約50行)
- `util/error.ts` (7行)
- `.env` (環境変数ファイル)
- `vite-env.d.ts` (型定義)

**今日のコード量: 約104行**

---

## 実装内容

### Part 1: React Hooksの理解(25分)

#### Step 1.1: useStateの理解(所要時間:12分)

**このステップで学ぶこと**: Reactの状態管理について学びます

**useStateとは?**

`useState`は、コンポーネント内で状態(State)を管理するためのフックです。

**基本的な使い方**:

```tsx
import { useState } from 'react';

const Counter = () => {
  // [現在の値, 値を更新する関数] = useState(初期値)
  const [count, setCount] = useState(0);

  return (
    <div>
      <p>カウント: {count}</p>
      <button onClick={() => setCount(count + 1)}>+1</button>
    </div>
  );
};
```

**複数の状態を管理**:

```tsx
const LoginForm = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  return (
    <div>
      <input
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
    </div>
  );
};
```

#### Step 1.2: useEffectの理解(所要時間:13分)

**このステップで学ぶこと**: 副作用を処理するuseEffectを学びます

**useEffectとは?**

コンポーネントのレンダリング後に実行される「副作用」を処理するフックです。

**基本的な使い方**:

```tsx
import { useEffect } from 'react';

useEffect(() => {
  // ここに副作用の処理を書く
  console.log('コンポーネントがレンダリングされました');
}, []);  // 依存配列(空の場合は初回のみ実行)
```

**依存配列の動作**:

```tsx
// 1. 依存配列なし → 毎回実行
useEffect(() => {
  console.log('毎回実行される');
});

// 2. 空の依存配列 → 初回のみ実行
useEffect(() => {
  console.log('初回のみ実行される');
}, []);

// 3. 依存配列あり → 依存値が変わった時に実行
useEffect(() => {
  console.log('countが変わった時に実行される');
}, [count]);
```

---

### Part 2: 環境変数の設定(20分)

#### Step 2.1: .envファイルの作成(所要時間:10分)

**このステップで学ぶこと**: 環境変数を設定します

**手順**:

1. プロジェクトのルートディレクトリ(package.jsonがある場所)に`.env`ファイルを作成
2. 以下の内容を記述:

```env
# 認証コード(任意の文字列を設定してください)
VITE_VIEWER_CODE=your_secret_code_here

# GitHub設定(Day 3で設定します)
VITE_GITHUB_TOKEN=
VITE_GITHUB_OWNER=
VITE_GITHUB_REPO=
VITE_GITHUB_FILE_PATH=
VITE_GITHUB_BRANCH=main
```

**⚠️ 重要な注意点**:
- Viteでは環境変数名は`VITE_`で始める必要があります
- `.env`ファイルは`.gitignore`に含まれているか確認
- `.env`ファイルをGitにコミットしないでください

#### Step 2.2: 環境変数の型定義(所要時間:10分)

**このステップで学ぶこと**: 環境変数に型を付けて、型安全に使用します

**ファイル**: `src/vite-env.d.ts`

既存の内容に以下を追加:

```tsx
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_VIEWER_CODE: string;
  readonly VITE_GITHUB_TOKEN: string;
  readonly VITE_GITHUB_OWNER: string;
  readonly VITE_GITHUB_REPO: string;
  readonly VITE_GITHUB_FILE_PATH: string;
  readonly VITE_GITHUB_BRANCH: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

これにより、`import.meta.env.VITE_VIEWER_CODE`を使用する際に、型の補完とチェックが効くようになります。

---

### Part 3: 認証ロジックの実装(40分)

#### Step 3.1: viewer-auth.tsxの更新(所要時間:25分)

**このステップで学ぶこと**: 昨日作成したUIに認証ロジックを追加します

**ファイル**: `src/page/viewer-auth.tsx`

昨日のコードを以下のように更新します:

```tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Box, Button, Card, CardContent, TextField, Typography, Alert } from '@mui/material';

const ViewerAuthPage = () => {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsVerifying(true);

    try {
      const validCode = import.meta.env.VITE_VIEWER_CODE;

      if (!validCode) {
        setError('認証システムの設定が不正です');
        setIsVerifying(false);
        return;
      }

      if (code === validCode) {
        sessionStorage.setItem('viewer-authenticated', 'true');
        void navigate('/view');
      } else {
        setError('認証コードが正しくありません');
        setIsVerifying(false);
      }
    } catch {
      setError('認証に失敗しました。もう一度お試しください。');
      setIsVerifying(false);
    }
  };

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

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          <form
            onSubmit={(e) => {
              void handleSubmit(e);
            }}
          >
            <TextField
              fullWidth
              label="認証コード"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              margin="normal"
              required
              autoComplete="off"
            />
            <Button
              fullWidth
              type="submit"
              variant="contained"
              size="large"
              disabled={isVerifying}
              sx={{ mt: 3, py: 1.5 }}
            >
              {isVerifying ? '認証中...' : '認証'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </Box>
  );
};

export default ViewerAuthPage;
```

**追加したコードの説明**:

**1. import の追加**:
```tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
```

**2. State の定義**:
```tsx
const [code, setCode] = useState('');          // 入力された認証コード
const [error, setError] = useState('');        // エラーメッセージ
const [isVerifying, setIsVerifying] = useState(false);  // 認証処理中フラグ
```

**3. handleSubmit 関数**:
```tsx
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();  // フォームのデフォルト送信を防ぐ
  setError('');        // エラーメッセージをクリア
  setIsVerifying(true);  // 認証処理開始

  try {
    const validCode = import.meta.env.VITE_VIEWER_CODE;

    if (code === validCode) {
      // 認証成功
      sessionStorage.setItem('viewer-authenticated', 'true');
      void navigate('/view');
    } else {
      // 認証失敗
      setError('認証コードが正しくありません');
      setIsVerifying(false);
    }
  } catch {
    setError('認証に失敗しました');
    setIsVerifying(false);
  }
};
```

**4. UI の更新**:
```tsx
{error && (
  <Alert severity="error" sx={{ mb: 2 }}>
    {error}
  </Alert>
)}
```
- エラーがある場合のみAlertを表示

```tsx
<TextField
  value={code}
  onChange={(e) => setCode(e.target.value)}
/>
```
- 入力値をStateと同期(制御されたコンポーネント)

```tsx
<Button
  disabled={isVerifying}
>
  {isVerifying ? '認証中...' : '認証'}
</Button>
```
- 認証中はボタンを無効化
- ボタンのテキストを動的に変更

#### Step 3.2: sessionStorageの理解(所要時間:15分)

**このステップで学ぶこと**: sessionStorageの使い方を理解します

**sessionStorageとは?**

ブラウザに一時的にデータを保存する仕組みです。タブを閉じると削除されます。

**基本的な使い方**:

```tsx
// 保存
sessionStorage.setItem('key', 'value');

// 取得
const value = sessionStorage.getItem('key');  // 'value'

// 削除
sessionStorage.removeItem('key');

// 全削除
sessionStorage.clear();
```

**localStorageとの違い**:

| 項目 | sessionStorage | localStorage |
|-----|---------------|-------------|
| 保存期間 | タブを閉じるまで | 手動で削除するまで |
| 用途 | セッション情報 | 永続的なデータ |

---

### Part 4: ページ保護の実装(45分)

#### Step 4.1: エラーユーティリティの作成(所要時間:10分)

**このステップで学ぶこと**: エラー処理のユーティリティ関数を作成します

**ファイル**: `src/util/error.ts`

```tsx
const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return '不明なエラーが発生しました';
};

export default getErrorMessage;
```

#### Step 4.2: view.tsxの作成(所要時間:35分)

**このステップで学ぶこと**: 認証が必要なページを保護します

**ファイル**: `src/page/view.tsx`

```tsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Box, Container, Typography, CircularProgress } from '@mui/material';

const ViewPage = () => {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // 認証チェック
    const isAuthenticated = sessionStorage.getItem('viewer-authenticated');

    if (!isAuthenticated || isAuthenticated !== 'true') {
      // 未認証の場合は認証ページにリダイレクト
      navigate('/viewer-auth');
    } else {
      setIsLoading(false);
    }
  }, [navigate]);

  if (isLoading) {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '100vh',
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Typography variant="h3" component="h1" gutterBottom>
        スキルシート表示ページ
      </Typography>
      <Typography variant="body1" color="text.secondary">
        認証に成功しました!このページは保護されています。
      </Typography>
      <Typography variant="body2" sx={{ mt: 2 }}>
        ※ Day 3でGitHubからデータを取得する機能を実装します
      </Typography>
    </Container>
  );
};

export default ViewPage;
```

**コードの説明**:

**1. useEffect による認証チェック**:
```tsx
useEffect(() => {
  const isAuthenticated = sessionStorage.getItem('viewer-authenticated');

  if (!isAuthenticated || isAuthenticated !== 'true') {
    navigate('/viewer-auth');
  } else {
    setIsLoading(false);
  }
}, [navigate]);
```

**処理の流れ**:
```
1. コンポーネントがマウント
   ↓
2. useEffect実行
   ↓
3. sessionStorageから認証状態を取得
   ↓
4a. 未認証 → /viewer-auth にリダイレクト
4b. 認証済み → isLoadingをfalseに
```

**2. ローディング表示**:
```tsx
if (isLoading) {
  return <CircularProgress />;
}
```

**3. app.tsxの更新**:

`src/app.tsx`に以下のRouteを追加します:

```tsx
import ViewerAuth from './page/viewer-auth';
import View from './page/view';  // 追加

const App = () => (
  <ThemeProvider theme={theme}>
    <CssBaseline />
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/viewer-auth" replace />} />
        <Route path="/viewer-auth" element={<ViewerAuth />} />
        <Route path="/view" element={<View />} />  {/* 追加 */}
      </Routes>
    </BrowserRouter>
  </ThemeProvider>
);
```

---

### Part 5: 動作確認(20分)

#### Step 5.1: 最終動作確認(所要時間:20分)

**このステップで学ぶこと**: 実装した認証機能を確認します

**確認手順**:

1. **開発サーバーを再起動**:

```bash
# サーバーを停止(Ctrl+C)
# 再起動(.envを読み込むため)
npm run dev
```

2. **ブラウザで確認**:

`http://localhost:5173/` にアクセス

**期待される動作**:

- ✅ `/viewer-auth` にリダイレクトされる
- ✅ 認証フォームが表示される
- ✅ 間違ったコードを入力 → エラーメッセージ表示
- ✅ 正しいコード(.envのVITE_VIEWER_CODE)を入力 → `/view` に遷移
- ✅ `/view` が表示される
- ✅ ブラウザをリロード → `/view` が表示される(認証状態が保持)
- ✅ タブを閉じて再度開く → 再度認証が必要

**デバッグ方法**:

**ブラウザの開発者ツールを開く**:
- Windows: `F12`
- Mac: `Cmd + Option + I`

**sessionStorageの確認**:
1. 開発者ツール → Application タブ
2. Storage → Session Storage
3. `http://localhost:5173` を選択
4. `viewer-authenticated` の値が `true` になっているか確認

**Consoleでの確認**:
```js
// sessionStorageの内容を確認
console.log(sessionStorage.getItem('viewer-authenticated'));

// sessionStorageをクリア(ログアウトのシミュレーション)
sessionStorage.clear();
```

---

## 🎓 今日学んだこと

### 重要な概念

1. **React Hooks**:
   - `useState`: 状態管理
   - `useEffect`: 副作用の処理

2. **フォーム処理**:
   - 制御されたコンポーネント(`value`と`onChange`)
   - `e.preventDefault()`: デフォルト動作の防止

3. **sessionStorage**:
   - ブラウザにデータを一時保存
   - タブを閉じると削除される

4. **環境変数**:
   - `.env`ファイルで管理
   - `VITE_`プレフィックス必須

5. **ページ保護**:
   - `useEffect`で認証チェック
   - 未認証の場合はリダイレクト

### 技術用語

| 用語 | 意味 |
|-----|------|
| **useState** | 状態管理のフック |
| **useEffect** | 副作用処理のフック |
| **sessionStorage** | セッション情報の保存先 |
| **制御されたコンポーネント** | Stateと同期されたフォーム要素 |

### 作成・更新したファイル

```
src/
├── page/
│   ├── viewer-auth.tsx  (更新: +47行)
│   └── view.tsx         (新規: 50行)
├── util/
│   └── error.ts         (新規: 7行)
├── app.tsx              (更新: +1行)
└── vite-env.d.ts        (更新)

.env (新規)
```

**今日のコード量: 104行**

---

## ✅ 確認問題

1. **useStateとletの違いは?**
   <details>
   <summary>回答を見る</summary>
   useStateで管理された状態が変更されると、コンポーネントが再レンダリングされます。letで宣言した変数は、値が変わっても画面は更新されません。
   </details>

2. **sessionStorageとlocalStorageの違いは?**
   <details>
   <summary>回答を見る</summary>
   sessionStorageはタブを閉じると削除されますが、localStorageは手動で削除するまで永続的に保存されます。
   </details>

3. **e.preventDefault()は何をしていますか?**
   <details>
   <summary>回答を見る</summary>
   フォームのデフォルト送信動作(ページリロード)を防ぎます。これにより、JavaScriptでフォーム送信を制御できます。
   </details>

---

## 🚀 次のステップ

明日(Day 3)は、GitHub APIと連携してスキルシートのデータを取得します!

**明日学ぶこと**:
- ✅ async/await
- ✅ fetch API
- ✅ GitHub API
- ✅ Base64デコード
- ✅ エラーハンドリング

**明日のコード量: 約126行**

---

## 📚 参考資料

- [React Hooks公式ドキュメント](https://react.dev/reference/react)
- [Web Storage API(MDN)](https://developer.mozilla.org/ja/docs/Web/API/Web_Storage_API)

---

お疲れ様でした! 🎉
今日で認証機能が完成しました。明日はGitHub APIと連携してデータを取得します!

---

## 実装方針追記（2026-06-21・完成プラン M0/M1）

### 認証の二系統分離
- 編集者（更新する側）= Better Auth（email/password）。`isEditor()` は Better Auth セッション必須。
- 閲覧者（見る側）= HMAC 署名 cookie（`VIEWER_CODE` / `/viewer-auth`）。閲覧専用で編集権限は一切持たない。
- 旧来の「HMAC cookie を編集者認可にフォールバック」する挙動は廃止（権限混同の解消）。

### owner_id の源（個人名リテラルの排除）
- `packages/db` の `OWNER_ID = 'kouiso'` ベタ書きを廃止し、`SKILLSHEET_OWNER_ID` 環境変数から取得する。
- 単一オーナー運用では、Better Auth で作成したオーナーアカウントに対応する安定IDを設定する。
- 書き込みは `isEditor()`（Better Auth セッション必須）でゲートし、認証されたオーナーのみが保存できる。

### DB ドライバ
- Better Auth の対話的トランザクションに対応するため、`neon-http` から `neon-serverless`（WebSocket）ドライバへ移行。

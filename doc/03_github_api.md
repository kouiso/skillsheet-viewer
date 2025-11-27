# Day 3: GitHub API連携とデータ取得

## 🎯 今日の学習目標

| 学習目標 | 実務での活用場面 | 習得レベル |
|---------|---------------|----------|
| **async/awaitの理解** | 非同期処理の基本 | ✅ 非同期関数を作成・使用できる |
| **fetch APIの使用** | HTTP通信の実装 | ✅ APIからデータを取得できる |
| **GitHub APIの連携** | 外部サービスとの統合 | ✅ GitHub APIを使ってファイルを取得できる |
| **Base64デコード** | エンコードされたデータの処理 | ✅ Base64データをデコードできる |
| **エラーハンドリング** | 例外処理の実装 | ✅ try-catchでエラーを適切に処理できる |

## 💼 なぜこれを学ぶのか?

**例え話: 図書館から本を取り寄せる**

GitHub APIを使うことは、図書館から本を取り寄せることに似ています。正しい認証情報(図書カード)を持って、特定の本(ファイル)を指定すると、司書(GitHub API)が本の内容を持ってきてくれます。

今日は、GitHubのプライベートリポジトリからMarkdownファイルを取得し、その内容を表示するための仕組みを作ります。これにより、スキルシートの実際のデータを表示できるようになります。

## 📊 実装ステップ一覧

| パート | 内容 | ステップ数 | 所要時間 |
|--------|------|-----------|----------|
| **Part 1** | async/awaitの理解 | 2ステップ | 30分 |
| **Part 2** | GitHub API設定 | 2ステップ | 25分 |
| **Part 3** | github-client.tsの実装 | 3ステップ | 60分 |
| **Part 4** | view.tsxの更新 | 2ステップ | 35分 |
| **Part 5** | 動作確認 | 1ステップ | 20分 |
| **合計** | - | **10ステップ** | **約3-3.5時間** |

**今日作成・更新するファイル:**
- `lib/github-client.ts` (86行)
- `page/view.tsx` (更新: +40行)
- `.env` (環境変数追加)

**今日のコード量: 126行**

---

## 実装内容

### Part 1: async/awaitの理解(30分)

#### Step 1.1: Promiseの基礎(所要時間:15分)

**このステップで学ぶこと**: 非同期処理の基本であるPromiseを理解します

**Promiseとは?**

非同期処理を扱うためのオブジェクトです。「将来的に結果が得られる約束」を表します。

**基本的な使い方**:

```tsx
// Promiseを返す関数
const fetchData = (): Promise<string> => {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      resolve('データ取得成功!');
    }, 1000);
  });
};

// then/catchを使った処理
fetchData()
  .then((data) => {
    console.log(data);  // 'データ取得成功!'
  })
  .catch((error) => {
    console.error(error);
  });
```

**Promiseの3つの状態**:

| 状態 | 説明 |
|-----|------|
| **Pending** | 処理中 |
| **Fulfilled** | 成功 (resolve) |
| **Rejected** | 失敗 (reject) |

#### Step 1.2: async/awaitの使い方(所要時間:15分)

**このステップで学ぶこと**: Promiseをより読みやすく書くasync/awaitを学びます

**async/awaitとは?**

Promiseをより直感的に扱うための構文です。同期処理のように書けます。

**基本的な使い方**:

```tsx
// async: 関数を非同期関数にする
const loadData = async () => {
  try {
    // await: Promiseの結果を待つ
    const data1 = await fetchData1();
    console.log(data1);

    const data2 = await fetchData2();
    console.log(data2);

    return '完了';
  } catch (error) {
    console.error('エラー:', error);
  }
};
```

**then/catch vs async/await**:

```tsx
// then/catch
fetchData()
  .then((data) => processData(data))
  .then((result) => console.log(result))
  .catch((error) => console.error(error));

// async/await (こちらの方が読みやすい!)
try {
  const data = await fetchData();
  const result = await processData(data);
  console.log(result);
} catch (error) {
  console.error(error);
}
```

**重要なルール**:
- `await`は`async`関数の中でのみ使える
- `async`関数は常にPromiseを返す

---

### Part 2: GitHub API設定(25分)

#### Step 2.1: GitHub Personal Access Tokenの取得(所要時間:15分)

**このステップで学ぶこと**: GitHub APIにアクセスするためのトークンを取得します

**手順**:

1. **GitHubにログイン**

2. **Settings → Developer settings → Personal access tokens → Tokens (classic)**

3. **"Generate new token (classic)" をクリック**

4. **トークンの設定**:
   - Note: `skillsheet-viewer` (任意の名前)
   - Expiration: `90 days` (お好みで)
   - Select scopes:
     - ✅ `repo` (Full control of private repositories)

5. **"Generate token" をクリック**

6. **⚠️ 重要**: 表示されたトークンをコピー
   - **このトークンは一度しか表示されません**
   - 安全な場所にメモしてください

#### Step 2.2: 環境変数の設定(所要時間:10分)

**このステップで学ぶこと**: GitHub APIの設定を環境変数に追加します

**ファイル**: `.env`

既存の`.env`ファイルを以下のように更新:

```env
# 認証コード
VITE_VIEWER_CODE=your_secret_code_here

# GitHub設定
VITE_GITHUB_TOKEN=ghp_your_token_here
VITE_GITHUB_OWNER=your-github-username
VITE_GITHUB_REPO=your-repository-name
VITE_GITHUB_FILE_PATH=skillsheet.md
VITE_GITHUB_BRANCH=main
```

**各項目の説明**:

| 変数名 | 説明 | 例 |
|-------|------|-----|
| `VITE_GITHUB_TOKEN` | Personal Access Token | `ghp_xxxx...` |
| `VITE_GITHUB_OWNER` | GitHubのユーザー名 | `your-username` |
| `VITE_GITHUB_REPO` | リポジトリ名 | `skillsheet` |
| `VITE_GITHUB_FILE_PATH` | ファイルパス | `skillsheet.md` |
| `VITE_GITHUB_BRANCH` | ブランチ名 | `main` |

**⚠️ セキュリティ注意事項**:
- `.env`ファイルを**絶対に**Gitにコミットしない
- `.gitignore`に`.env`が含まれているか確認
- トークンは他人に共有しない

---

### Part 3: github-client.tsの実装(60分)

#### Step 3.1: 型定義とConfig設定(所要時間:20分)

**このステップで学ぶこと**: GitHub APIクライアントの基礎を作ります

**ファイル**: `src/lib/github-client.ts`

まず、srcフォルダに`lib`フォルダを作成し、その中に`github-client.ts`を作成します。

```tsx
/**
 * GitHub API client for fetching skill sheet content from private repository
 * Client-side version
 */

interface GitHubConfig {
  token: string;
  owner: string;
  repo: string;
  filePath: string;
  branch: string;
}

interface SkillSheetContent {
  content: string;
  sha: string;
  lastModified: string;
}

function getGitHubConfig(): GitHubConfig {
  return {
    token: import.meta.env.VITE_GITHUB_TOKEN || '',
    owner: import.meta.env.VITE_GITHUB_OWNER || '',
    repo: import.meta.env.VITE_GITHUB_REPO || '',
    filePath: import.meta.env.VITE_GITHUB_FILE_PATH || 'skillsheet.md',
    branch: import.meta.env.VITE_GITHUB_BRANCH || 'main',
  };
}
```

**コードの説明**:

**1. GitHubConfig インターフェース**:
```tsx
interface GitHubConfig {
  token: string;       // アクセストークン
  owner: string;       // リポジトリのオーナー
  repo: string;        // リポジトリ名
  filePath: string;    // ファイルパス
  branch: string;      // ブランチ名
}
```

**2. SkillSheetContent インターフェース**:
```tsx
interface SkillSheetContent {
  content: string;      // Markdownの内容
  sha: string;          // ファイルのSHAハッシュ
  lastModified: string; // 最終更新日時
}
```

**3. getGitHubConfig 関数**:
```tsx
function getGitHubConfig(): GitHubConfig {
  return {
    token: import.meta.env.VITE_GITHUB_TOKEN || '',
    // ...
  };
}
```
- 環境変数から設定を読み込む
- `|| ''`: 環境変数が未設定の場合は空文字

#### Step 3.2: バリデーションとエラーハンドリング(所要時間:20分)

**このステップで学ぶこと**: 設定の検証とエラー処理を実装します

**同じファイルに追加**:

```tsx
function validateConfig(config: GitHubConfig): void {
  if (!config.token || !config.owner || !config.repo) {
    throw new Error(
      'GitHub configuration is incomplete. Please set VITE_GITHUB_TOKEN, VITE_GITHUB_OWNER, and VITE_GITHUB_REPO environment variables.',
    );
  }
}

function handleResponseError(response: Response, config: GitHubConfig): void {
  if (response.status === 404) {
    throw new Error(`File not found: ${config.filePath} in ${config.owner}/${config.repo}`);
  }
  if (response.status === 401) {
    throw new Error('GitHub authentication failed. Please check your VITE_GITHUB_TOKEN.');
  }
  throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
}
```

**コードの説明**:

**1. validateConfig 関数**:
```tsx
function validateConfig(config: GitHubConfig): void {
  if (!config.token || !config.owner || !config.repo) {
    throw new Error('設定が不完全です');
  }
}
```
- 必須項目が設定されているかチェック
- 問題があれば例外をスロー

**2. handleResponseError 関数**:
```tsx
function handleResponseError(response: Response, config: GitHubConfig): void {
  if (response.status === 404) {
    throw new Error('ファイルが見つかりません');
  }
  if (response.status === 401) {
    throw new Error('認証に失敗しました');
  }
  throw new Error(`APIエラー: ${response.status}`);
}
```

**HTTPステータスコード**:

| コード | 意味 |
|-------|------|
| **200** | 成功 |
| **401** | 認証エラー(トークンが無効) |
| **404** | ファイルが見つからない |

#### Step 3.3: fetchSkillSheet 関数の実装(所要時間:20分)

**このステップで学ぶこと**: GitHub APIからファイルを取得する関数を実装します

**同じファイルに追加**:

```tsx
/**
 * Fetch skill sheet content from GitHub private repository
 */
export async function fetchSkillSheet(): Promise<SkillSheetContent> {
  const config = getGitHubConfig();
  validateConfig(config);

  const url = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${config.filePath}?ref=${config.branch}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${config.token}`,
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'Skill-Sheet-Viewer',
    },
  });

  if (!response.ok) {
    handleResponseError(response, config);
  }

  const data = await response.json();

  // Base64 decode the content with proper UTF-8 handling
  const base64Content = data.content.replace(/\n/g, '');
  const binaryString = atob(base64Content);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  const decoder = new TextDecoder('utf-8');
  const decodedContent = decoder.decode(bytes);

  return {
    content: decodedContent,
    sha: data.sha,
    lastModified: data.commit?.author?.date || new Date().toISOString(),
  };
}
```

**コードの詳細解説**:

**1. GitHub API URL の構築**:
```tsx
const url = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${config.filePath}?ref=${config.branch}`;
```
- 例: `https://api.github.com/repos/username/skillsheet/contents/skillsheet.md?ref=main`

**2. fetch API の使用**:
```tsx
const response = await fetch(url, {
  headers: {
    Authorization: `Bearer ${config.token}`,
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'Skill-Sheet-Viewer',
  },
});
```

**ヘッダーの説明**:

| ヘッダー | 説明 |
|---------|------|
| `Authorization` | 認証トークン |
| `Accept` | GitHub API v3を使用 |
| `User-Agent` | アプリケーション名 |

**3. レスポンスのチェック**:
```tsx
if (!response.ok) {
  handleResponseError(response, config);
}
```

**4. JSONデータの取得**:
```tsx
const data = await response.json();
```

**5. Base64デコード**:
```tsx
// 改行を削除
const base64Content = data.content.replace(/\n/g, '');

// Base64をバイナリ文字列に変換
const binaryString = atob(base64Content);

// バイナリ文字列をUint8Arrayに変換
const bytes = new Uint8Array(binaryString.length);
for (let i = 0; i < binaryString.length; i++) {
  bytes[i] = binaryString.charCodeAt(i);
}

// UTF-8デコード
const decoder = new TextDecoder('utf-8');
const decodedContent = decoder.decode(bytes);
```

**Base64デコードが必要な理由**:
- GitHub APIはファイル内容をBase64エンコードして返す
- UTF-8の日本語を正しく扱うため、適切にデコードする必要がある

**処理の流れ**:
```
Base64文字列
   ↓ atob()
バイナリ文字列
   ↓ Uint8Array変換
バイト配列
   ↓ TextDecoder
UTF-8文字列 (日本語対応!)
```

---

### Part 4: view.tsxの更新(35分)

#### Step 4.1: 型定義とインポート(所要時間:10分)

**このステップで学ぶこと**: view.tsxを更新してGitHubからデータを取得します

**ファイル**: `src/page/view.tsx`

昨日のコードを以下のように更新します:

```tsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import { Box, CircularProgress, Typography } from '@mui/material';

import { fetchSkillSheet } from '@/lib/github-client';

interface SkillSheet {
  title: string;
  content: string;
}
```

**変更点**:
- `fetchSkillSheet`をインポート
- `SkillSheet`インターフェースを追加

**パスエイリアス `@/` について**:
- `@/`は`src/`を指すエイリアス
- `tsconfig.json`と`vite.config.ts`で設定済み
- `import { fetchSkillSheet } from '@/lib/github-client'`
- = `import { fetchSkillSheet } from '../lib/github-client'`

#### Step 4.2: データ取得ロジックの実装(所要時間:25分)

**このステップで学ぶこと**: GitHub APIからデータを取得して表示します

**同じファイルを更新**:

```tsx
const ViewPage = () => {
  const navigate = useNavigate();
  const [skillSheet, setSkillSheet] = useState<SkillSheet | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Check authentication
    const isAuthenticated = sessionStorage.getItem('viewer-authenticated') === 'true';

    if (!isAuthenticated) {
      void navigate('/viewer-auth');
      return;
    }

    // Fetch skill sheet
    const loadSkillSheet = async () => {
      try {
        setLoading(true);
        const data = await fetchSkillSheet();
        setSkillSheet({
          title: 'エンジニアスキルシート',
          content: data.content,
        });
        setError(null);
      } catch (err) {
        console.error('Error fetching skill sheet:', err);
        setError('エンジニアスキルシートの読み込みに失敗しました。');
      } finally {
        setLoading(false);
      }
    };

    void loadSkillSheet();
  }, [navigate]);

  if (loading) {
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

  if (error) {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '100vh',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        <Typography variant="h4">エラー</Typography>
        <Typography variant="body1">{error}</Typography>
      </Box>
    );
  }

  if (!skillSheet) {
    return null;
  }

  return (
    <Box sx={{ p: 4 }}>
      <Typography variant="h3" gutterBottom>
        {skillSheet.title}
      </Typography>
      <Typography
        variant="body1"
        component="pre"
        sx={{
          whiteSpace: 'pre-wrap',
          fontFamily: 'monospace',
          backgroundColor: '#f5f5f5',
          p: 2,
          borderRadius: 1,
        }}
      >
        {skillSheet.content}
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block' }}>
        ※ Day 4でMarkdown表示を実装します
      </Typography>
    </Box>
  );
};

export default ViewPage;
```

**コードの説明**:

**1. State の定義**:
```tsx
const [skillSheet, setSkillSheet] = useState<SkillSheet | null>(null);
const [loading, setLoading] = useState(true);
const [error, setError] = useState<string | null>(null);
```

**2. loadSkillSheet 関数**:
```tsx
const loadSkillSheet = async () => {
  try {
    setLoading(true);
    const data = await fetchSkillSheet();
    setSkillSheet({
      title: 'エンジニアスキルシート',
      content: data.content,
    });
    setError(null);
  } catch (err) {
    console.error('Error fetching skill sheet:', err);
    setError('エンジニアスキルシートの読み込みに失敗しました。');
  } finally {
    setLoading(false);
  }
};
```

**try-catch-finally の流れ**:
```
try {
  処理が成功した場合の処理
} catch (err) {
  エラーが発生した場合の処理
} finally {
  成功・失敗に関わらず必ず実行される処理
}
```

**3. 画面の状態管理**:

| 条件 | 表示内容 |
|-----|---------|
| `loading === true` | ローディングスピナー |
| `error !== null` | エラーメッセージ |
| `skillSheet === null` | null (何も表示しない) |
| 上記以外 | スキルシートの内容 |

**4. 仮のMarkdown表示**:
```tsx
<Typography
  component="pre"
  sx={{
    whiteSpace: 'pre-wrap',
    fontFamily: 'monospace',
  }}
>
  {skillSheet.content}
</Typography>
```
- `component="pre"`: preタグとしてレンダリング
- `whiteSpace: 'pre-wrap'`: 改行を保持
- 明日、react-markdownで綺麗に表示します!

---

### Part 5: 動作確認(20分)

#### Step 5.1: 最終動作確認(所要時間:20分)

**このステップで学ぶこと**: GitHub APIとの連携を確認します

**事前準備**:

1. **GitHubにスキルシートファイルを作成**:
   - GitHubで新しいリポジトリを作成(プライベートでOK)
   - `skillsheet.md`ファイルを作成
   - 以下のような内容を記述:

```markdown
# 私のスキルシート

## 基本情報
- 名前: 山田太郎
- 職種: フロントエンドエンジニア

## スキル
- React
- TypeScript
- Material-UI

## プロジェクト経験
### プロジェクトA
Reactを使用したWebアプリケーション開発
```

2. **開発サーバーを再起動**:
```bash
# サーバーを停止(Ctrl+C)
# 再起動(.envを読み込むため)
npm run dev
```

**確認手順**:

1. `http://localhost:5173/` にアクセス

2. **期待される動作**:
   - ✅ 認証ページが表示される
   - ✅ 正しい認証コードを入力
   - ✅ `/view` に遷移
   - ✅ ローディングスピナーが表示される
   - ✅ GitHubからデータを取得
   - ✅ スキルシートの内容が表示される(Markdown形式そのまま)

**トラブルシューティング**:

| エラー | 原因 | 対処法 |
|-------|------|-------|
| `GitHub configuration is incomplete` | 環境変数が未設定 | `.env`を確認 |
| `GitHub authentication failed` | トークンが無効 | トークンを再生成 |
| `File not found` | ファイルパスが間違っている | `.env`の`VITE_GITHUB_FILE_PATH`を確認 |
| `CORS error` | ※通常は発生しない | GitHub APIはCORSに対応 |

**デバッグ方法**:

**ブラウザの開発者ツール → Console**:

エラーメッセージを確認:
```
Error fetching skill sheet: Error: GitHub authentication failed
```

**Network タブ**:
1. 開発者ツール → Network
2. ページをリロード
3. `contents` という名前のリクエストを確認
4. Status Code を確認:
   - 200: 成功
   - 401: 認証エラー
   - 404: ファイルが見つからない

**環境変数の確認**:
```tsx
// src/page/view.tsx の loadSkillSheet 内に追加(デバッグ用)
console.log('GitHub Token:', import.meta.env.VITE_GITHUB_TOKEN?.substring(0, 10) + '...');
console.log('GitHub Owner:', import.meta.env.VITE_GITHUB_OWNER);
console.log('GitHub Repo:', import.meta.env.VITE_GITHUB_REPO);
```

**⚠️ デバッグ後は削除してください**(トークンが漏れる可能性があるため)

---

## 🎓 今日学んだこと

### 重要な概念

1. **非同期処理**:
   - Promise: 将来的に得られる値
   - async/await: Promiseを読みやすく書く構文

2. **fetch API**:
   - HTTP通信を行うブラウザAPI
   - headers で認証情報を送信

3. **GitHub API**:
   - Contents API: ファイルの内容を取得
   - Base64エンコード: ファイル内容の形式

4. **Base64デコード**:
   - `atob()`: Base64をデコード
   - `TextDecoder`: バイト配列をUTF-8文字列に変換

5. **エラーハンドリング**:
   - try-catch-finally
   - HTTPステータスコードの処理

### 技術用語

| 用語 | 意味 |
|-----|------|
| **async/await** | 非同期処理を同期的に書く構文 |
| **Promise** | 非同期処理の結果を表すオブジェクト |
| **fetch** | HTTP通信を行うAPI |
| **Base64** | バイナリデータをテキストで表現する方式 |
| **Personal Access Token** | GitHub APIの認証トークン |

### 作成・更新したファイル

```
src/
├── lib/
│   └── github-client.ts  (新規: 86行)
├── page/
│   └── view.tsx          (更新: +40行)
└── .env                  (更新)
```

**今日のコード量: 126行**

---

## ✅ 確認問題

1. **async/awaitの利点は何ですか?**
   <details>
   <summary>回答を見る</summary>
   Promiseのthen/catchチェーンより読みやすく、同期処理のように書けます。エラーハンドリングもtry-catchで統一的に処理できます。
   </details>

2. **なぜGitHub APIはファイル内容をBase64エンコードして返すのですか?**
   <details>
   <summary>回答を見る</summary>
   JSONは基本的にテキストデータを扱うため、バイナリファイルや特殊文字を安全に送信するためにBase64エンコードを使用します。
   </details>

3. **try-catch-finallyのfinallyブロックはいつ実行されますか?**
   <details>
   <summary>回答を見る</summary>
   tryブロックが成功してもcatchブロックでエラーが発生しても、必ず実行されます。リソースの解放やローディング状態の解除などに使われます。
   </details>

---

## 🚀 次のステップ

明日(Day 4)は、Markdownを綺麗に表示します!

**明日学ぶこと**:
- ✅ react-markdown
- ✅ remarkGfm (GitHub Flavored Markdown)
- ✅ rehypeSlug (見出しにIDを追加)
- ✅ CSSスタイリング

**明日のコード量: 約95行**

---

## 📚 参考資料

- [GitHub REST API - Contents](https://docs.github.com/ja/rest/repos/contents)
- [MDN - fetch API](https://developer.mozilla.org/ja/docs/Web/API/Fetch_API)
- [MDN - async function](https://developer.mozilla.org/ja/docs/Web/JavaScript/Reference/Statements/async_function)
- [MDN - Base64](https://developer.mozilla.org/ja/docs/Glossary/Base64)

---

お疲れ様でした! 🎉
今日でGitHubからデータを取得できるようになりました。明日はMarkdownを綺麗に表示します!

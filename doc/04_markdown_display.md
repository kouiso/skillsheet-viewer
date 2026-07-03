# Day 4: Markdown表示とプラグイン

## 🎯 今日の学習目標

| 学習目標 | 実務での活用場面 | 習得レベル |
|---------|---------------|----------|
| **react-markdownの使用** | Markdownコンテンツの表示 | ✅ react-markdownで内容を表示できる |
| **remarkプラグインの理解** | Markdown構文の拡張 | ✅ remarkGfmで表やタスクリストを表示できる |
| **rehypeプラグインの理解** | HTML処理の拡張 | ✅ rehypeSlugで見出しにIDを付与できる |
| **CSSスタイリング** | Markdownの見た目調整 | ✅ Material-UIと統合したスタイルを適用できる |
| **Boxレイアウト** | ページレイアウトの構築 | ✅ Flexboxでレイアウトできる |

## 💼 なぜこれを学ぶのか?

**例え話: 新聞記事のレイアウト**

Markdownを表示することは、新聞記事のレイアウトに似ています。記者が書いた原稿(Markdown)を、読みやすいレイアウトで印刷する(HTML + CSS)ことで、読者に価値を提供します。

今日は、昨日取得したMarkdownデータを、react-markdownとプラグインを使って美しく表示します。見出し、段落、コードブロック、表など、すべてが適切にスタイリングされます。

## 📊 実装ステップ一覧

| パート | 内容 | ステップ数 | 所要時間 |
|--------|------|-----------|----------|
| **Part 1** | ライブラリのインストール | 1ステップ | 10分 |
| **Part 2** | 基本的なMarkdown表示 | 2ステップ | 30分 |
| **Part 3** | プラグインの導入 | 2ステップ | 25分 |
| **Part 4** | スタイリングの実装 | 2ステップ | 50分 |
| **Part 5** | 動作確認 | 1ステップ | 15分 |
| **合計** | - | **8ステップ** | **約2.5-3時間** |

**今日作成・更新するファイル:**
- `component/skill-sheet-viewer.tsx` 前半 (95行)
- `page/view.tsx` (更新: 数行)

**今日のコード量: 95行**

---

## 実装内容

### Part 1: ライブラリのインストール(10分)

#### Step 1.1: 必要なパッケージのインストール(所要時間:10分)

**このステップで学ぶこと**: Markdown表示に必要なライブラリをインストールします

**コマンドの実行**:

```bash
npm install react-markdown remark-gfm rehype-slug
```

**パッケージの説明**:

| パッケージ | 説明 | 用途 |
|-----------|------|------|
| **react-markdown** | ReactでMarkdownをレンダリング | Markdownを HTMLに変換 |
| **remark-gfm** | GitHub Flavored Markdown | 表、タスクリスト、打ち消し線 |
| **rehype-slug** | 見出しにIDを自動付与 | アンカーリンク用のID生成 |

**remarkとrehypeの違い**:

```
Markdown文字列
    ↓
[remark] - Markdown構文の処理
    ↓
MDAST (Markdown Abstract Syntax Tree)
    ↓
HAST (HTML Abstract Syntax Tree)
    ↓
[rehype] - HTML構文の処理
    ↓
HTML要素
```

| ツール | 処理対象 | 例 |
|-------|---------|-----|
| **remark** | Markdown構文 | GFM表、タスクリストの解析 |
| **rehype** | HTML | 見出しへのID付与、サニタイズ |

---

### Part 2: 基本的なMarkdown表示(30分)

#### Step 2.1: SkillSheetViewerコンポーネントの作成(所要時間:20分)

**このステップで学ぶこと**: Markdownを表示する基本的なコンポーネントを作成します

**ファイル**: `src/component/skill-sheet-viewer.tsx`

まず、srcフォルダに`component`フォルダを作成し、その中に`skill-sheet-viewer.tsx`を作成します。

```tsx
import ReactMarkdown from 'react-markdown';

import { Box, Container, Typography, Paper } from '@mui/material';
import rehypeSlug from 'rehype-slug';
import remarkGfm from 'remark-gfm';

interface SkillSheetViewerProps {
  skillSheet: {
    title: string;
    content: string;
  };
}

const SkillSheetViewer = ({ skillSheet }: SkillSheetViewerProps) => {
  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', backgroundColor: '#f5f5f5' }}>
      {/* メインコンテンツ */}
      <Container maxWidth="md" sx={{ py: 4, flex: 1 }}>
        <Paper sx={{ p: 4 }}>
          <Typography variant="h3" component="h1" gutterBottom>
            {skillSheet.title}
          </Typography>

          <Box className="markdown-content">
            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSlug]}>
              {skillSheet.content}
            </ReactMarkdown>
          </Box>
        </Paper>
      </Container>
    </Box>
  );
};

export default SkillSheetViewer;
```

**コードの説明**:

**1. インポート**:
```tsx
import ReactMarkdown from 'react-markdown';
import rehypeSlug from 'rehype-slug';
import remarkGfm from 'remark-gfm';
```

**2. Props の型定義**:
```tsx
interface SkillSheetViewerProps {
  skillSheet: {
    title: string;
    content: string;
  };
}
```

**3. レイアウトの構造**:
```tsx
<Box sx={{ display: 'flex', minHeight: '100vh', backgroundColor: '#f5f5f5' }}>
  <Container maxWidth="md" sx={{ py: 4, flex: 1 }}>
    <Paper sx={{ p: 4 }}>
      {/* コンテンツ */}
    </Paper>
  </Container>
</Box>
```

**レイアウトの階層**:
```
Box (Flexコンテナ、背景色)
 └─ Container (最大幅md=900px)
     └─ Paper (白い紙のような見た目)
         └─ タイトル + Markdownコンテンツ
```

**4. ReactMarkdown の使用**:
```tsx
<ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSlug]}>
  {skillSheet.content}
</ReactMarkdown>
```

| プロパティ | 説明 |
|-----------|------|
| `remarkPlugins` | Markdown構文の拡張 |
| `rehypePlugins` | HTML処理の拡張 |
| 子要素 | Markdown文字列 |

#### Step 2.2: view.tsxの更新(所要時間:10分)

**このステップで学ぶこと**: view.tsxでSkillSheetViewerを使用します

**ファイル**: `src/page/view.tsx`

最後のreturn文を以下のように変更:

```tsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import { Box, CircularProgress, Typography } from '@mui/material';

import SkillSheetViewer from '@/component/skill-sheet-viewer';  // 追加
import { fetchSkillSheet } from '@/lib/github-client';

// ... (SkillSheetインターフェース、ViewPage関数の前半は変更なし)

  // 最後のreturn文のみ変更
  if (!skillSheet) {
    return null;
  }

  return <SkillSheetViewer skillSheet={skillSheet} />;
};

export default ViewPage;
```

**変更点**:
- `SkillSheetViewer`をインポート
- 最後のreturn文を`<SkillSheetViewer />`に変更

---

### Part 3: プラグインの導入(25分)

#### Step 3.1: remarkGfmの理解(所要時間:12分)

**このステップで学ぶこと**: GitHub Flavored Markdownを理解します

**remarkGfm とは?**

GitHubで使われているMarkdown拡張機能を提供するプラグインです。

**対応する機能**:

| 機能 | Markdown記法 | 表示 |
|-----|------------|------|
| **表** | `\| 列1 \| 列2 \|` | テーブル |
| **タスクリスト** | `- [ ] タスク` | ☐ タスク |
| **打ち消し線** | `~~削除~~` | ~~削除~~ |
| **オートリンク** | `https://example.com` | https://example.com |

**使用例**:

```markdown
# 表の例
| 名前 | 年齢 |
|------|------|
| 太郎 | 25 |
| 花子 | 23 |

# タスクリストの例
- [x] 完了したタスク
- [ ] 未完了のタスク

# 打ち消し線の例
~~この部分は削除されました~~
```

**remarkGfmなしの場合**:
- 表が表示されない(Markdown文字列そのまま)
- タスクリストがただのリスト
- 打ち消し線が効かない

**remarkGfmありの場合**:
- 表が綺麗に表示される
- チェックボックスが表示される
- 打ち消し線が適用される

#### Step 3.2: rehypeSlugの理解(所要時間:13分)

**このステップで学ぶこと**: 見出しにIDを付与する仕組みを理解します

**rehypeSlug とは?**

Markdownの見出しに自動的にIDを付与するプラグインです。

**変換の例**:

**Markdown**:
```markdown
# はじめに
## 基本情報
```

**rehypeSlugなし**:
```html
<h1>はじめに</h1>
<h2>基本情報</h2>
```

**rehypeSlugあり**:
```html
<h1 id="はじめに">はじめに</h1>
<h2 id="基本情報">基本情報</h2>
```

**ID生成のルール**:

| 見出し | 生成されるID |
|--------|------------|
| `# Hello World` | `hello-world` |
| `## React Hooks` | `react-hooks` |
| `### はじめに` | `はじめに` |

**なぜIDが必要?**

1. **アンカーリンク**: `#basic-info`でその見出しにジャンプ
2. **目次の実装**: 明日実装します!
3. **ブックマーク**: URLで特定のセクションを共有

---

### Part 4: スタイリングの実装(50分)

#### Step 4.1: 定数の定義(所要時間:10分)

**このステップで学ぶこと**: スタイルで使う定数を定義します

**ファイル**: `src/component/skill-sheet-viewer.tsx`

コンポーネントの前に定数を追加:

```tsx
import { useState, useEffect } from 'react';  // 追加
import ReactMarkdown from 'react-markdown';

import { Box, Container, Typography, Paper, List, ListItem, ListItemButton } from '@mui/material';  // 更新
import rehypeSlug from 'rehype-slug';
import remarkGfm from 'remark-gfm';

interface Heading {  // 追加(Day 5で使用)
  id: string;
  text: string;
  level: number;
}

interface SkillSheetViewerProps {
  skillSheet: {
    title: string;
    content: string;
  };
}

// 定数の定義
const MAX_HEADING_LEVEL_INDENT = 2;
const SIDEBAR_WIDTH = 280;
const LARGE_FONT_SIZE = 0.95;
const SMALL_FONT_SIZE = 0.875;
const FONT_WEIGHT_BOLD = 600;
const FONT_WEIGHT_NORMAL = 400;

const SkillSheetViewer = ({ skillSheet }: SkillSheetViewerProps) => {
  // ... (以下のコードは次のステップで追加)
```

**定数の説明**:

| 定数 | 値 | 説明 |
|-----|---|------|
| `MAX_HEADING_LEVEL_INDENT` | `2` | 目次のインデント幅 |
| `SIDEBAR_WIDTH` | `280` | サイドバーの幅(px) |
| `LARGE_FONT_SIZE` | `0.95` | 大きいフォント(rem) |
| `SMALL_FONT_SIZE` | `0.875` | 小さいフォント(rem) |
| `FONT_WEIGHT_BOLD` | `600` | 太字 |
| `FONT_WEIGHT_NORMAL` | `400` | 通常 |

**なぜ定数を使うのか?**
- マジックナンバー(意味不明な数値)を避ける
- 一箇所で値を管理できる
- コードの可読性が向上

#### Step 4.2: Markdownコンテンツのスタイリング(所要時間:40分)

**このステップで学ぶこと**: Markdownの各要素にスタイルを適用します

**同じファイルを更新**:

ReactMarkdownを含むBoxコンポーネントのsx propsを以下のように更新:

```tsx
<Box
  className="markdown-content"
  sx={{
    '& h1, & h2, & h3, & h4, & h5, & h6': {
      mt: 3,
      mb: 2,
      fontWeight: 600,
    },
    '& h1': { fontSize: '2rem', borderBottom: '2px solid #e0e0e0', pb: 1 },
    '& h2': { fontSize: '1.5rem', borderBottom: '1px solid #e0e0e0', pb: 1 },
    '& h3': { fontSize: '1.25rem' },
    '& p': { mb: 2, lineHeight: 1.7 },
    '& code': {
      backgroundColor: '#f5f5f5',
      padding: '2px 6px',
      borderRadius: '3px',
      fontSize: '0.9em',
      fontFamily: 'monospace',
    },
    '& pre': {
      backgroundColor: '#f5f5f5',
      padding: '1rem',
      borderRadius: '4px',
      overflowX: 'auto',
      mb: 2,
    },
    '& pre code': {
      backgroundColor: 'transparent',
      padding: 0,
    },
    '& table': {
      width: '100%',
      borderCollapse: 'collapse',
      mb: 2,
    },
    '& th, & td': {
      border: '1px solid #e0e0e0',
      padding: '8px 12px',
      textAlign: 'left',
    },
    '& th': {
      backgroundColor: '#f5f5f5',
      fontWeight: 600,
    },
    '& ul, & ol': {
      mb: 2,
      pl: 3,
    },
    '& li': {
      mb: 0.5,
    },
    '& blockquote': {
      borderLeft: '4px solid #e0e0e0',
      pl: 2,
      ml: 0,
      fontStyle: 'italic',
      color: '#666',
    },
    '& a': {
      color: '#1976d2',
      textDecoration: 'none',
      '&:hover': {
        textDecoration: 'underline',
      },
    },
  }}
>
  <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSlug]}>
    {skillSheet.content}
  </ReactMarkdown>
</Box>
```

**スタイルの詳細解説**:

**1. 見出し (h1~h6)**:
```tsx
'& h1, & h2, & h3, & h4, & h5, & h6': {
  mt: 3,         // margin-top: 24px
  mb: 2,         // margin-bottom: 16px
  fontWeight: 600,
},
'& h1': {
  fontSize: '2rem',                        // 32px
  borderBottom: '2px solid #e0e0e0',       // 下線
  pb: 1,                                    // padding-bottom: 8px
},
```

**セレクタ `&` の意味**:
- `&`: 親要素(`.markdown-content`)を指す
- `& h1`: `.markdown-content h1` と同じ
- 子孫セレクタ

**2. 段落 (p)**:
```tsx
'& p': {
  mb: 2,           // 段落の下に余白
  lineHeight: 1.7, // 行の高さ(読みやすさ向上)
},
```

**3. インラインコード (code)**:
```tsx
'& code': {
  backgroundColor: '#f5f5f5',  // 薄いグレーの背景
  padding: '2px 6px',           // 内側の余白
  borderRadius: '3px',          // 角を丸く
  fontSize: '0.9em',            // 少し小さく
  fontFamily: 'monospace',      // 等幅フォント
},
```

**例**: `const value = 42;`

**4. コードブロック (pre)**:
```tsx
'& pre': {
  backgroundColor: '#f5f5f5',
  padding: '1rem',
  borderRadius: '4px',
  overflowX: 'auto',  // 横スクロール
  mb: 2,
},
'& pre code': {
  backgroundColor: 'transparent',  // preの背景を使う
  padding: 0,
},
```

**例**:
```javascript
function hello() {
  console.log('Hello!');
}
```

**5. 表 (table)**:
```tsx
'& table': {
  width: '100%',
  borderCollapse: 'collapse',  // セルの境界を結合
  mb: 2,
},
'& th, & td': {
  border: '1px solid #e0e0e0',
  padding: '8px 12px',
  textAlign: 'left',
},
'& th': {
  backgroundColor: '#f5f5f5',  // ヘッダー行の背景
  fontWeight: 600,
},
```

**6. リスト (ul, ol)**:
```tsx
'& ul, & ol': {
  mb: 2,
  pl: 3,  // padding-left: 24px (インデント)
},
'& li': {
  mb: 0.5,  // リスト項目間の余白
},
```

**7. 引用 (blockquote)**:
```tsx
'& blockquote': {
  borderLeft: '4px solid #e0e0e0',  // 左側に太い線
  pl: 2,                             // 左の余白
  ml: 0,
  fontStyle: 'italic',               // 斜体
  color: '#666',                     // グレーの文字
},
```

**例**:
> これは引用です

**8. リンク (a)**:
```tsx
'& a': {
  color: '#1976d2',           // Material-UIの青
  textDecoration: 'none',     // 下線なし
  '&:hover': {
    textDecoration: 'underline',  // ホバー時に下線
  },
},
```

**スタイルの優先順位**:
```
1. インラインスタイル (style属性)
2. sx props
3. className
4. ブラウザのデフォルトスタイル
```

---

### Part 5: 動作確認(15分)

#### Step 5.1: 最終動作確認(所要時間:15分)

**このステップで学ぶこと**: Markdownが綺麗に表示されることを確認します

**確認用のMarkdownサンプル**:

GitHubの`skillsheet.md`を以下のような内容に更新してテストします:

```markdown
# エンジニアスキルシート

## 基本情報

- **名前**: 山田太郎
- **職種**: フロントエンドエンジニア
- **経験年数**: 3年

## スキル

### フロントエンド

| 技術 | 習熟度 | 経験年数 |
|------|--------|----------|
| React | ⭐⭐⭐⭐⭐ | 3年 |
| TypeScript | ⭐⭐⭐⭐ | 2年 |
| Material-UI | ⭐⭐⭐ | 1年 |

### バックエンド

- Node.js
- Express
- PostgreSQL

## プロジェクト経験

### プロジェクトA (2022年4月 - 2023年3月)

**概要**: ECサイトのフロントエンド開発

**担当業務**:
- [ ] 要件定義
- [x] 設計
- [x] 実装
- [x] テスト

**技術スタック**:
```javascript
const stack = {
  frontend: 'React + TypeScript',
  ui: 'Material-UI',
  state: 'Redux Toolkit',
};
```

> このプロジェクトでReactの設計力が大きく向上しました。

## コード例

インラインコード: `const greeting = 'Hello, World!';`

詳細なコード:
```typescript
interface User {
  id: number;
  name: string;
}

const users: User[] = [
  { id: 1, name: '太郎' },
  { id: 2, name: '花子' },
];
```

## リンク

- [GitHub](https://github.com)
- [React公式](https://react.dev)

---

**最終更新**: 2024年1月
```

**期待される表示**:

1. **開発サーバーを起動**:
```bash
npm run dev
```

2. **ブラウザで確認** (`http://localhost:5173/`):
   - ✅ 認証後、`/view`に遷移
   - ✅ 見出しが階層的に表示される
   - ✅ 見出しに下線がある(h1, h2)
   - ✅ 表が綺麗に表示される
   - ✅ タスクリストにチェックボックスがある
   - ✅ コードブロックに背景色がある
   - ✅ インラインコードがハイライトされる
   - ✅ 引用が左に線がある
   - ✅ リンクが青色で、ホバーで下線

**デバッグ方法**:

**開発者ツールでスタイルを確認**:
1. 要素を右クリック → 検証
2. Stylesタブでスタイルを確認
3. `markdown-content`クラスのスタイルが適用されているか確認

**よくある問題**:

| 問題 | 原因 | 対処法 |
|-----|------|-------|
| 表が表示されない | remarkGfmがない | `remarkPlugins={[remarkGfm]}`を確認 |
| 見出しにIDがない | rehypeSlugがない | `rehypePlugins={[rehypeSlug]}`を確認 |
| スタイルが効かない | sxの記述ミス | セレクタ`&`の記述を確認 |

---

## 🎓 今日学んだこと

### 重要な概念

1. **react-markdown**:
   - Markdownを Reactコンポーネントに変換
   - プラグインで機能拡張可能

2. **remarkプラグイン**:
   - Markdown構文の拡張
   - remarkGfm: GitHub風の機能

3. **rehypeプラグイン**:
   - HTML処理の拡張
   - rehypeSlug: 見出しにID付与

4. **Material-UI sx props**:
   - 子孫セレクタ(`&`)でスタイル適用
   - ネストしたスタイル定義

5. **定数の活用**:
   - マジックナンバーを避ける
   - 保守性の向上

### 技術用語

| 用語 | 意味 |
|-----|------|
| **react-markdown** | MarkdownをReactで表示するライブラリ |
| **remark** | Markdown処理のプラグインシステム |
| **rehype** | HTML処理のプラグインシステム |
| **GFM** | GitHub Flavored Markdown |
| **子孫セレクタ** | 親要素内の特定の要素を指定 |

### 作成・更新したファイル

```
src/
├── component/
│   └── skill-sheet-viewer.tsx  (新規: 95行)
└── page/
    └── view.tsx                (更新: 数行)
```

**今日のコード量: 95行**

---

## ✅ 確認問題

1. **remarkとrehypeの違いは何ですか?**
   <details>
   <summary>回答を見る</summary>
   remarkはMarkdown構文を処理し、rehypeはHTML構文を処理します。remarkでMarkdownを解析し、rehypeでHTMLに変換後の処理を行います。
   </details>

2. **sx propsの`&`セレクタは何を指していますか?**
   <details>
   <summary>回答を見る</summary>
   親要素(この場合は`.markdown-content`クラスを持つBox)を指します。`& h1`は`.markdown-content h1`と同じ意味です。
   </details>

3. **なぜpre code要素のbackgroundColorをtransparentにするのですか?**
   <details>
   <summary>回答を見る</summary>
   pre要素(コードブロック)の背景色を使用するためです。code要素自体に背景色を設定すると、pre要素の背景と二重になってしまいます。
   </details>

---

## 🚀 次のステップ

明日(Day 5)は、目次機能とデプロイを実装します!

**明日学ぶこと**:
- ✅ 正規表現による見出し抽出
- ✅ 目次の動的生成
- ✅ スムーズスクロール
- ✅ Vercelへのデプロイ

**明日のコード量: 約96行**

---

## 📚 参考資料

- [react-markdown公式ドキュメント](https://github.com/remarkjs/react-markdown)
- [remark-gfm](https://github.com/remarkjs/remark-gfm)
- [rehype-slug](https://github.com/rehypejs/rehype-slug)
- [GitHub Flavored Markdown仕様](https://github.github.com/gfm/)

---

お疲れ様でした! 🎉
今日でMarkdownが綺麗に表示できるようになりました。明日は目次機能を追加してアプリを完成させます!

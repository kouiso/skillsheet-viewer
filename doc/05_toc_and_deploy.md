# Day 5: 目次機能とデプロイ

## 🎯 今日の学習目標

| 学習目標 | 実務での活用場面 | 習得レベル |
|---------|---------------|----------|
| **正規表現の使用** | テキストパターンの抽出 | ✅ 正規表現で見出しを抽出できる |
| **動的UIの生成** | データからUIを自動生成 | ✅ 見出しから目次を動的に生成できる |
| **スムーズスクロール** | ユーザー体験の向上 | ✅ クリックでスムーズにスクロールできる |
| **固定レイアウト** | サイドバーの実装 | ✅ 固定サイドバーを実装できる |
| **Vercelデプロイ** | アプリの公開 | ✅ Vercelにアプリをデプロイできる |

## 💼 なぜこれを学ぶのか?

**例え話: 本の目次と索引**

長い文書には目次が必要です。本屋で本を選ぶとき、目次を見て内容を把握しますよね。同じように、スキルシートにも目次があると、どこに何が書いてあるかすぐに分かります。

今日は、Markdownの見出しから自動的に目次を生成し、クリックでその箇所にジャンプする機能を実装します。そして、完成したアプリをVercelで世界中に公開します!

## 📊 実装ステップ一覧

| パート | 内容 | ステップ数 | 所要時間 |
|--------|------|-----------|----------|
| **Part 1** | 正規表現による見出し抽出 | 2ステップ | 35分 |
| **Part 2** | 目次UIの実装 | 2ステップ | 40分 |
| **Part 3** | スクロール機能の実装 | 1ステップ | 25分 |
| **Part 4** | 最終調整 | 1ステップ | 20分 |
| **Part 5** | Vercelへのデプロイ | 2ステップ | 30分 |
| **合計** | - | **8ステップ** | **約2.5-3時間** |

**今日作成・更新するファイル:**
- `component/skill-sheet-viewer.tsx` 後半 (96行追加)
- `.gitignore` (確認)
- `vercel.json` (オプション)

**今日のコード量: 96行**

---

## 実装内容

### Part 1: 正規表現による見出し抽出(35分)

#### Step 1.1: 正規表現の理解(所要時間:15分)

**このステップで学ぶこと**: 正規表現でMarkdownの見出しを抽出する方法を学びます

**正規表現とは?**

テキストのパターンを表現する特殊な文字列です。「特定のパターンに一致する文字列を探す」ときに使います。

**基本的なパターン**:

| パターン | 意味 | 例 |
|---------|------|-----|
| `^` | 行の先頭 | `^#` = 行頭の# |
| `$` | 行の末尾 | `world$` = worldで終わる |
| `.` | 任意の1文字 | `a.c` = abc, a1c |
| `+` | 1回以上の繰り返し | `a+` = a, aa, aaa |
| `*` | 0回以上の繰り返し | `a*` = "", a, aa |
| `{n,m}` | n回以上m回以下 | `a{1,3}` = a, aa, aaa |
| `()` | グループ化 | `(abc)+` = abc, abcabc |
| `\s` | 空白文字 | スペース、タブ |

**Markdown見出しのパターン**:

```
# レベル1
## レベル2
### レベル3
```

**パターン分析**:
1. 行頭から始まる (`^`)
2. 1〜6個の`#` (`#{1,6}`)
3. スペース (`\s+`)
4. テキスト (`.+`)
5. 行末まで (`$`)

**正規表現**:
```javascript
/^(#{1,6})\s+(.+)$/gm
```

**フラグの説明**:

| フラグ | 意味 |
|-------|------|
| `g` | Global - すべてマッチ |
| `m` | Multiline - 複数行対応 |

**実際の使用例**:

```typescript
const markdown = `
# タイトル
## セクション1
### サブセクション
## セクション2
`;

const regex = /^(#{1,6})\s+(.+)$/gm;
const matches = [...markdown.matchAll(regex)];

matches.forEach(match => {
  console.log('ハッシュ:', match[1]);  // #, ##, ###
  console.log('テキスト:', match[2]);  // タイトル, セクション1, ...
});
```

**matchAllの結果**:
```javascript
[
  ['# タイトル', '#', 'タイトル'],
  ['## セクション1', '##', 'セクション1'],
  ['### サブセクション', '###', 'サブセクション'],
  ['## セクション2', '##', 'セクション2'],
]
```

| インデックス | 内容 |
|------------|------|
| `[0]` | マッチした全文字列 |
| `[1]` | 1つ目のグループ `(#{1,6})` |
| `[2]` | 2つ目のグループ `(.+)` |

#### Step 1.2: 見出し抽出ロジックの実装(所要時間:20分)

**このステップで学ぶこと**: Markdownから見出しを抽出してStateに保存します

**ファイル**: `src/component/skill-sheet-viewer.tsx`

コンポーネント内にStateとuseEffectを追加:

```tsx
const SkillSheetViewer = ({ skillSheet }: SkillSheetViewerProps) => {
  const [headings, setHeadings] = useState<Heading[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Markdownから見出しを抽出
    const extractHeadings = () => {
      const headingRegex = /^(#{1,6})\s+(.+)$/gm;
      const matches = [...skillSheet.content.matchAll(headingRegex)];

      const extractedHeadings: Heading[] = matches.map((match) => {
        const level = match[1].length;
        const text = match[2];
        const id = text
          .toLowerCase()
          .replace(/[^\s\w-]/g, '')
          .replace(/\s+/g, '-');

        return { id, text, level };
      });

      setHeadings(extractedHeadings);
      setMounted(true);
    };

    extractHeadings();
  }, [skillSheet.content]);

  // ... (以下のreturn文は次のパートで更新)
```

**コードの説明**:

**1. State の定義**:
```tsx
const [headings, setHeadings] = useState<Heading[]>([]);
const [mounted, setMounted] = useState(false);
```
- `headings`: 抽出した見出しのリスト
- `mounted`: コンポーネントがマウントされたか(サイドバー表示判定)

**2. useEffect で見出しを抽出**:
```tsx
useEffect(() => {
  const extractHeadings = () => {
    // 抽出ロジック
  };
  extractHeadings();
}, [skillSheet.content]);
```
- `skillSheet.content`が変わったら再実行

**3. 正規表現でマッチ**:
```tsx
const headingRegex = /^(#{1,6})\s+(.+)$/gm;
const matches = [...skillSheet.content.matchAll(headingRegex)];
```
- `matchAll()`: すべてのマッチを取得
- `[...]`: イテレータを配列に変換

**4. 見出しオブジェクトの作成**:
```tsx
const extractedHeadings: Heading[] = matches.map((match) => {
  const level = match[1].length;  // #の数
  const text = match[2];           // 見出しテキスト
  const id = text
    .toLowerCase()                 // 小文字に
    .replace(/[^\s\w-]/g, '')     // 英数字とスペースとハイフン以外を削除
    .replace(/\s+/g, '-');         // スペースをハイフンに

  return { id, text, level };
});
```

**ID生成の例**:

| 見出し | ID |
|--------|-----|
| `# Hello World` | `hello-world` |
| `## React Hooks` | `react-hooks` |
| `### 基本情報` | `基本情報` |

**5. State更新**:
```tsx
setHeadings(extractedHeadings);
setMounted(true);
```

---

### Part 2: 目次UIの実装(40分)

#### Step 2.1: サイドバーの追加(所要時間:20分)

**このステップで学ぶこと**: 固定サイドバーで目次を表示します

**同じファイルのreturn文を更新**:

```tsx
return (
  <Box sx={{ display: 'flex', minHeight: '100vh', backgroundColor: '#f5f5f5' }}>
    {/* 目次(左サイドバー) */}
    {mounted && (
      <Paper
        sx={{
          width: SIDEBAR_WIDTH,
          position: 'fixed',
          height: '100vh',
          overflowY: 'auto',
          p: MAX_HEADING_LEVEL_INDENT,
          borderRadius: 0,
        }}
      >
        <Typography variant="h6" gutterBottom>
          目次
        </Typography>
        <List dense>
          {headings.map((heading, index) => (
            <ListItem key={index} disablePadding sx={{ pl: (heading.level - 1) * MAX_HEADING_LEVEL_INDENT }}>
              <ListItemButton onClick={() => scrollToHeading(heading.id)}>
                <Typography
                  variant="body2"
                  sx={{
                    fontSize: heading.level === 1 ? `${LARGE_FONT_SIZE}rem` : `${SMALL_FONT_SIZE}rem`,
                    fontWeight: heading.level === 1 ? FONT_WEIGHT_BOLD : FONT_WEIGHT_NORMAL,
                  }}
                >
                  {heading.text}
                </Typography>
              </ListItemButton>
            </ListItem>
          ))}
        </List>
      </Paper>
    )}

    {/* メインコンテンツ */}
    <Container
      maxWidth="md"
      sx={{
        ml: mounted ? `${SIDEBAR_WIDTH}px` : 0,
        py: 4,
        flex: 1,
      }}
    >
      <Paper sx={{ p: 4 }}>
        <Typography variant="h3" component="h1" gutterBottom>
          {skillSheet.title}
        </Typography>

        <Box
          className="markdown-content"
          sx={{
            // ... (昨日のスタイルをそのまま使用)
          }}
        >
          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSlug]}>
            {skillSheet.content}
          </ReactMarkdown>
        </Box>
      </Paper>
    </Container>
  </Box>
);
```

**コードの説明**:

**1. 条件付きレンダリング**:
```tsx
{mounted && (
  <Paper>
    {/* サイドバー */}
  </Paper>
)}
```
- `mounted`がtrueの時だけ表示
- 見出しの抽出が完了してから表示

**2. 固定サイドバー**:
```tsx
<Paper
  sx={{
    width: SIDEBAR_WIDTH,      // 280px
    position: 'fixed',          // 固定配置
    height: '100vh',            // 画面いっぱいの高さ
    overflowY: 'auto',          // 縦スクロール可能
    p: MAX_HEADING_LEVEL_INDENT,
    borderRadius: 0,            // 角を丸くしない
  }}
>
```

**positionの種類**:

| 値 | 動作 |
|----|------|
| `static` | デフォルト |
| `relative` | 相対配置 |
| `absolute` | 絶対配置 |
| `fixed` | 固定(スクロールしても動かない) |
| `sticky` | スクロールで固定 |

**3. 目次リスト**:
```tsx
<List dense>
  {headings.map((heading, index) => (
    <ListItem key={index} disablePadding sx={{ pl: (heading.level - 1) * MAX_HEADING_LEVEL_INDENT }}>
      {/* ... */}
    </ListItem>
  ))}
</List>
```

**インデントの計算**:
```
レベル1 (h1): (1-1) * 2 = 0px
レベル2 (h2): (2-1) * 2 = 2 * 8px = 16px
レベル3 (h3): (3-1) * 2 = 4 * 8px = 32px
```

**4. メインコンテンツの調整**:
```tsx
<Container
  maxWidth="md"
  sx={{
    ml: mounted ? `${SIDEBAR_WIDTH}px` : 0,  // サイドバー分の左マージン
    py: 4,
    flex: 1,
  }}
>
```

**レイアウトの構造**:
```
┌─────────────────────────────────┐
│ Box (display: flex)             │
│ ┌─────────┬─────────────────────┤
│ │ Paper   │ Container           │
│ │ (fixed) │ (ml: 280px)         │
│ │ 目次    │ メインコンテンツ     │
│ │         │                     │
│ │         │                     │
│ └─────────┴─────────────────────┤
└─────────────────────────────────┘
```

#### Step 2.2: 見出しのスタイリング(所要時間:20分)

**このステップで学ぶこと**: 目次の見出しに適切なスタイルを適用します

**ListItemButtonの内容**:

```tsx
<ListItemButton onClick={() => scrollToHeading(heading.id)}>
  <Typography
    variant="body2"
    sx={{
      fontSize: heading.level === 1 ? `${LARGE_FONT_SIZE}rem` : `${SMALL_FONT_SIZE}rem`,
      fontWeight: heading.level === 1 ? FONT_WEIGHT_BOLD : FONT_WEIGHT_NORMAL,
    }}
  >
    {heading.text}
  </Typography>
</ListItemButton>
```

**スタイルの動的変更**:

```tsx
fontSize: heading.level === 1 ? `${LARGE_FONT_SIZE}rem` : `${SMALL_FONT_SIZE}rem`
```
- h1(レベル1): 0.95rem (15.2px)
- h2以降: 0.875rem (14px)

```tsx
fontWeight: heading.level === 1 ? FONT_WEIGHT_BOLD : FONT_WEIGHT_NORMAL
```
- h1(レベル1): 600 (太字)
- h2以降: 400 (通常)

**Material-UIのListコンポーネント**:

| コンポーネント | 役割 |
|--------------|------|
| `List` | リストコンテナ |
| `ListItem` | リスト項目 |
| `ListItemButton` | クリック可能な項目 |
| `ListItemText` | テキスト表示(今回はTypography使用) |

**dense プロパティ**:
```tsx
<List dense>
```
- リスト項目の間隔を狭くする
- コンパクトな表示

---

### Part 3: スクロール機能の実装(25分)

#### Step 3.1: スムーズスクロールの実装(所要時間:25分)

**このステップで学ぶこと**: クリックで該当の見出しにスクロールします

**同じファイルに関数を追加**:

useEffectの後、returnの前に追加:

```tsx
const scrollToHeading = (id: string) => {
  const element = document.querySelector(`#${id}`);
  if (element) {
    element.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
};
```

**コードの説明**:

**1. 要素の取得**:
```tsx
const element = document.querySelector(`#${id}`);
```
- `document.querySelector`: DOMから要素を取得
- `#${id}`: IDセレクタ

**例**:
```tsx
// id = 'basic-info'の場合
document.querySelector('#basic-info')
// <h2 id="basic-info">基本情報</h2> を取得
```

**2. スクロール**:
```tsx
element.scrollIntoView({ behavior: 'smooth', block: 'start' });
```

**scrollIntoView のオプション**:

| オプション | 値 | 説明 |
|-----------|---|------|
| `behavior` | `'smooth'` | スムーズにスクロール |
| | `'auto'` | 瞬時に移動 |
| `block` | `'start'` | 要素を画面の上部に配置 |
| | `'center'` | 画面の中央に配置 |
| | `'end'` | 画面の下部に配置 |

**3. 安全性チェック**:
```tsx
if (element) {
  // 要素が存在する場合のみスクロール
}
```

**動作の流れ**:
```
1. ユーザーが目次の項目をクリック
   ↓
2. scrollToHeading('basic-info')が呼ばれる
   ↓
3. document.querySelector('#basic-info')で要素を取得
   ↓
4. element.scrollIntoView()でスムーズにスクロール
   ↓
5. 該当の見出しが画面上部に表示される
```

**完成したコード全体のイメージ**:

```tsx
const SkillSheetViewer = ({ skillSheet }: SkillSheetViewerProps) => {
  // 1. State
  const [headings, setHeadings] = useState<Heading[]>([]);
  const [mounted, setMounted] = useState(false);

  // 2. 見出し抽出
  useEffect(() => {
    const extractHeadings = () => {
      // 見出しを抽出してStateに保存
    };
    extractHeadings();
  }, [skillSheet.content]);

  // 3. スクロール関数
  const scrollToHeading = (id: string) => {
    // クリックでスクロール
  };

  // 4. UI
  return (
    <Box>
      {/* サイドバー(目次) */}
      {/* メインコンテンツ */}
    </Box>
  );
};
```

---

### Part 4: 最終調整(20分)

#### Step 4.1: 動作確認と微調整(所要時間:20分)

**このステップで学ぶこと**: アプリ全体の動作を確認し、必要に応じて調整します

**確認項目**:

1. **開発サーバーを起動**:
```bash
npm run dev
```

2. **機能確認**:
   - ✅ 認証ページで認証できる
   - ✅ GitHubからスキルシートを取得できる
   - ✅ 左サイドバーに目次が表示される
   - ✅ 目次の項目がインデントされている
   - ✅ h1が太字で大きく表示される
   - ✅ 目次の項目をクリックでスクロールする
   - ✅ スクロールがスムーズ
   - ✅ Markdownが綺麗に表示される

**微調整のポイント**:

**1. サイドバーの幅が狭い場合**:
```tsx
const SIDEBAR_WIDTH = 320;  // 280 → 320に変更
```

**2. 見出しのフォントサイズ調整**:
```tsx
const LARGE_FONT_SIZE = 1.0;   // 0.95 → 1.0
const SMALL_FONT_SIZE = 0.9;   // 0.875 → 0.9
```

**3. インデント幅の調整**:
```tsx
const MAX_HEADING_LEVEL_INDENT = 3;  // 2 → 3
```

**4. スクロール位置の調整**:
```tsx
element.scrollIntoView({ behavior: 'smooth', block: 'center' });
// start → center に変更
```

**トラブルシューティング**:

| 問題 | 原因 | 対処法 |
|-----|------|-------|
| 目次が表示されない | `mounted`がfalse | useEffectで`setMounted(true)`を確認 |
| クリックしても動かない | IDが一致していない | 開発者ツールで要素のidを確認 |
| サイドバーが固定されない | `position: 'fixed'`がない | sxプロパティを確認 |
| メインコンテンツが隠れる | `ml`が設定されていない | Containerの`ml`を確認 |

---

### Part 5: Vercelへのデプロイ(30分)

#### Step 5.1: デプロイの準備(所要時間:15分)

**このステップで学ぶこと**: アプリをデプロイする準備をします

**1. .gitignoreの確認**:

プロジェクトルートの`.gitignore`ファイルを確認:

```gitignore
# Logs
logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Dependencies
node_modules

# Production
dist

# Environment
.env
.env.local
.env.production

# IDE
.vscode/*
!.vscode/extensions.json
.idea

# OS
.DS_Store
```

**重要**: `.env`が含まれているか必ず確認!

**2. Gitリポジトリの作成**:

```bash
# Gitの初期化(まだの場合)
git init

# 変更をステージング
git add .

# コミット
git commit -m "Initial commit: Skillsheet Viewer"

# GitHubリポジトリと連携
git remote add origin https://github.com/your-username/skillsheet-viewer.git

# プッシュ
git push -u origin main
```

**3. vercel.jsonの作成(オプション)**:

プロジェクトルートに`vercel.json`を作成:

```json
{
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```

**なぜ必要?**
- React RouterのSPAルーティングをサポート
- すべてのパスを`index.html`にリダイレクト

#### Step 5.2: Vercelへのデプロイ(所要時間:15分)

**このステップで学ぶこと**: Vercelでアプリを公開します

**手順**:

**1. Vercelにアクセス**:
- [https://vercel.com](https://vercel.com) にアクセス
- GitHubアカウントでサインアップ/ログイン

**2. 新規プロジェクトの作成**:
1. "Add New..." → "Project"をクリック
2. GitHubリポジトリを連携
3. `skillsheet-viewer`リポジトリを選択
4. "Import"をクリック

**3. プロジェクト設定**:

| 項目 | 設定値 |
|-----|-------|
| Framework Preset | Vite |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Install Command | `npm install` |

**4. 環境変数の設定**:

"Environment Variables"セクションで、`.env`の内容を追加:

```
VITE_VIEWER_CODE=your_secret_code_here
VITE_GITHUB_TOKEN=ghp_your_token_here
VITE_GITHUB_OWNER=your-github-username
VITE_GITHUB_REPO=your-repository-name
VITE_GITHUB_FILE_PATH=skillsheet.md
VITE_GITHUB_BRANCH=main
```

**⚠️ 重要**:
- すべての環境変数を設定
- トークンは漏れないように注意

**5. デプロイ**:
1. "Deploy"をクリック
2. 2-3分待つ
3. デプロイ完了!

**6. 確認**:
- デプロイされたURLにアクセス
- `https://skillsheet-viewer-xxx.vercel.app`のような形式
- 認証 → スキルシート表示を確認

**デプロイ後の更新**:

```bash
# コードを修正
# ...

# コミット
git add .
git commit -m "Update: ..."

# プッシュ
git push

# Vercelが自動的に再デプロイ!
```

**トラブルシューティング**:

| 問題 | 原因 | 対処法 |
|-----|------|-------|
| Build failed | 依存関係のエラー | package.jsonを確認 |
| 404 Error | vercel.jsonがない | vercel.jsonを追加 |
| 環境変数が効かない | 設定忘れ | Vercelの設定を確認 |
| GitHub APIエラー | トークンが無効 | 環境変数を再設定 |

**カスタムドメインの設定(オプション)**:

1. Vercelのプロジェクト設定 → "Domains"
2. カスタムドメインを追加
3. DNSレコードを設定
4. 完了!

---

## 🎓 今日学んだこと

### 重要な概念

1. **正規表現**:
   - パターンマッチング
   - グループとキャプチャ
   - フラグ(g, m)

2. **動的UI生成**:
   - データからUIを自動生成
   - map関数でリスト表示

3. **DOM操作**:
   - querySelector
   - scrollIntoView

4. **固定レイアウト**:
   - position: fixed
   - Flexboxレイアウト

5. **デプロイ**:
   - Vercelでの公開
   - 環境変数の設定
   - 継続的デプロイ

### 技術用語

| 用語 | 意味 |
|-----|------|
| **正規表現** | テキストパターンのマッチング |
| **DOM** | Document Object Model |
| **scrollIntoView** | 要素をスクロール表示 |
| **position: fixed** | 固定配置 |
| **Vercel** | ホスティングプラットフォーム |

### 作成・更新したファイル

```
src/
└── component/
    └── skill-sheet-viewer.tsx  (更新: +96行)

vercel.json  (新規)
```

**今日のコード量: 96行**

**5日間の合計コード量: 509行**

---

## ✅ 確認問題

1. **正規表現`/^(#{1,6})\s+(.+)$/gm`の各部分の意味は?**
   <details>
   <summary>回答を見る</summary>
   - `^`: 行頭
   - `(#{1,6})`: 1〜6個の#をキャプチャ
   - `\s+`: 1つ以上の空白
   - `(.+)`: 1文字以上の任意の文字をキャプチャ
   - `$`: 行末
   - `g`: すべてマッチ
   - `m`: 複数行モード
   </details>

2. **position: fixedとposition: absoluteの違いは?**
   <details>
   <summary>回答を見る</summary>
   fixedはビューポート(画面)を基準に固定され、スクロールしても動きません。absoluteは親要素を基準に絶対配置され、スクロールで動きます。
   </details>

3. **なぜvercel.jsonが必要なのですか?**
   <details>
   <summary>回答を見る</summary>
   React RouterなどのSPAは、すべてのパスをindex.htmlにルーティングする必要があります。vercel.jsonでリライトルールを設定し、404エラーを防ぎます。
   </details>

---

## 🚀 次のステップ

**おめでとうございます!** 🎉

5日間でスキルシートビューアーを完成させました!

**学んだこと(総まとめ)**:

### Day 1: 環境構築とアプリの骨格
- Viteプロジェクト作成
- React Router設定
- Material-UI導入

### Day 2: 認証機能
- React Hooks (useState, useEffect)
- sessionStorage
- フォーム処理

### Day 3: GitHub API連携
- async/await
- fetch API
- Base64デコード

### Day 4: Markdown表示
- react-markdown
- remarkGfm, rehypeSlug
- CSSスタイリング

### Day 5: 目次とデプロイ
- 正規表現
- 動的UI生成
- Vercelデプロイ

**今後の拡張アイデア**:

1. **ダークモード**: Material-UIのテーマ切り替え
2. **PDF出力**: react-to-pdfでPDF生成
3. **検索機能**: Markdownコンテンツの全文検索
4. **履歴機能**: 更新履歴の表示
5. **コメント機能**: 各セクションへのコメント
6. **多言語対応**: i18nで国際化

---

## 📚 参考資料

- [正規表現 - MDN](https://developer.mozilla.org/ja/docs/Web/JavaScript/Guide/Regular_Expressions)
- [DOM - MDN](https://developer.mozilla.org/ja/docs/Web/API/Document_Object_Model)
- [Vercel公式ドキュメント](https://vercel.com/docs)
- [React Router - SPA on Vercel](https://vercel.com/guides/using-react-router-with-vercel)

---

## 🎉 完走おめでとうございます!

5日間お疲れ様でした!

**あなたが達成したこと**:
- ✅ Viteで最新のReact開発環境を構築
- ✅ Material-UIで美しいUIを実装
- ✅ React RouterでSPAを作成
- ✅ GitHub APIと連携
- ✅ Markdownを綺麗に表示
- ✅ 目次機能を実装
- ✅ Vercelで世界に公開

**総コード量: 509行**

これらのスキルは、実務でも必ず役立ちます。
次は自分のアイデアでアプリを作ってみましょう! 🚀

---

**おまけ: 完成したアプリの構成**

```
skillsheet-viewer/
├── src/
│   ├── main.tsx                  (11行) - エントリーポイント
│   ├── app.tsx                   (27行) - ルーティング
│   ├── page/
│   │   ├── viewer-auth.tsx       (97行) - 認証ページ
│   │   └── view.tsx              (90行) - スキルシート表示
│   ├── component/
│   │   └── skill-sheet-viewer.tsx (191行) - Markdownビューア
│   ├── lib/
│   │   └── github-client.ts      (86行) - GitHub API
│   └── util/
│       └── error.ts              (7行) - エラー処理
├── .env                          - 環境変数
├── vercel.json                   - Vercel設定
└── package.json                  - 依存関係

総コード量: 509行
```

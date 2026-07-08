# 04. Markdown 表示と PDF 出力

このドキュメントでは、スキルシートの本文を安全に描画する react-markdown のパイプラインと、`@react-pdf/renderer` によるクライアント PDF 出力を解説する。

関連ドキュメント: [03 データ層](03_github_api.md) / [05 目次とデプロイ](05_toc_and_deploy.md)

---

## Part 1: react-markdown パイプライン

本文描画の中心は `apps/web/src/component/skill-sheet-viewer.tsx`（クライアントコンポーネント）。`ReactMarkdown` に remark / rehype プラグインを固定配列で渡す。

```tsx
// skill-sheet-viewer.tsx（抜粋）
const REMARK_PLUGINS = [remarkGfm, remarkBreaks];
const REHYPE_PLUGINS = [
  rehypeRaw,
  [rehypeSanitize, SANITIZE_SCHEMA],
  rehypeSlug,
];
```

プラグイン配列はモジュールスコープで固定し、毎レンダーの再生成を防いでいる。処理順は次のとおり。

```
Markdown 文字列
  │  remark-gfm      … GFM（表・タスクリスト・打ち消し線・オートリンク）
  │  remark-breaks   … 単一改行を <br> に
  ▼ （mdast → hast）
  │  rehype-raw      … Markdown 中の生 HTML を hast に取り込む
  │  rehype-sanitize … SANITIZE_SCHEMA で許可要素・属性・プロトコルに限定
  │  rehype-slug     … 見出しに id を付与（目次のアンカー用）
  ▼
安全な HTML 要素
```

順序が重要で、`rehype-raw` で生 HTML を取り込んだ **後に** `rehype-sanitize` を通すことで、生 HTML も必ずサニタイズされる。`rehype-slug` は最後に走り、サニタイズ後の見出しへ id を付ける。付与された id は目次（[05](05_toc_and_deploy.md)）が利用する。

---

## Part 2: サニタイズ（SANITIZE_SCHEMA）

`rehype-sanitize` の `defaultSchema` を拡張し、必要最小限だけ許可を広げている。

```tsx
// skill-sheet-viewer.tsx（抜粋）
const IMG_SRC_PROTOCOLS = ['http', 'https'] as const;

const SANITIZE_SCHEMA = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), 'details', 'summary'],
  attributes: {
    ...defaultSchema.attributes,
    details: ['open'],
  },
  protocols: {
    ...defaultSchema.protocols,
    src: [...IMG_SRC_PROTOCOLS],
  },
};
```

- `rehype-raw` で有効化する生 HTML は実質 `<details>` / `<summary>`（折りたたみ）に限定する。`style` 属性は既定スキーマで除外されたまま（XSS 防止）。
- 画像 `src` は `http` / `https` のみ許可。`javascript:` や `data:` を弾く。
- コンポーネント側でも `isSafeImageSrc()` が二重に検証する。相対パス（スキーム無し）は許可、スキーム付きは http(s) のみ通す。

---

## Part 3: 要素ごとのカスタム描画

`ReactMarkdown` の `components` で一部要素の描画を差し替える。

### コード

`code` は言語クラスまたは改行の有無でブロック/インラインを判定し、ブロックのみ `CodeBlock`（`src/component/code-block.tsx`）で描画する。`CodeBlock` は `react-syntax-highlighter`（Prism）でシンタックスハイライトし、テーマ（`useThemeMode`）に応じて配色を切り替え、コピー ボタンを備える。

```tsx
code(props) {
  const { className, children, ...rest } = props;
  const isBlock = /language-/.test(className ?? '') || /\n/.test(String(children));
  if (!isBlock) return <code className={className} {...rest}>{children}</code>;
  return <CodeBlock className={className}>{children}</CodeBlock>;
}
```

### テーブル

GFM の列揃えは remark-rehype が `th`/`td` の `properties.align` に載せる。`th`/`td` を差し替え、`align` を inline `text-align` へ変換して桁揃えを決定する（未指定列は `left`）。

```tsx
const cellTextAlign = (align: unknown): 'left' | 'center' | 'right' =>
  align === 'center' ? 'center' : align === 'right' ? 'right' : 'left';
```

### 画像とライトボックス

`img` はボタンでラップし、クリックで `yet-another-react-lightbox` を開く。`isSafeImageSrc()` を通らない `src` は描画しない（`null` を返す）。

### ブロック描画の分岐

DB のブロック（[03](03_github_api.md)）を渡す場合、`markdown` / `table` / `experience` は Markdown 文字列に変換して `MarkdownContent` で描画し、`skills` / `profile` / `stats` / `project` は専用の React コンポーネント（`SkillMatrix` / `ProfileIntro` / `StatRow` / `ProjectCard`）で描画する。連続する `skills` ブロックは 1 つのコンテナへグループ化する。本文は `activeId` に依存しないよう `MarkdownContent` を `memo` 化し、スクロールごとの再描画を避けている。

---

## Part 4: PDF 出力（@react-pdf/renderer）

PDF はクライアントで動的 import して生成する。重い `@react-pdf/renderer` を初期バンドルに含めないための遅延ロードである。

```tsx
// app/view/[path]/sheet-view-client.tsx（抜粋）
const handleDownloadPdf = async () => {
  const [{ pdf }, { SkillSheetPDF }] = await Promise.all([
    import('@react-pdf/renderer'),
    import('@/component/pdf-export'),
  ]);
  const blob = await pdf(<SkillSheetPDF title={title} content={content} />).toBlob();
  const url = URL.createObjectURL(blob);
  // <a download> を生成してクリック → 生成した ObjectURL は遅延 revoke
};
```

- `@react-pdf/renderer` の `pdf(...).toBlob()` でドキュメントを Blob 化し、`URL.createObjectURL` + 一時 `<a download>` でダウンロードさせる。ObjectURL は少し遅延させて `revokeObjectURL` する。
- `SkillSheetPDF`（`src/component/pdf-export.tsx`）は描画前に `registerPdfFonts()` でバンドル済み日本語フォント（Noto Sans JP）を登録し、純粋描画の `SkillSheetDocument`（`src/component/pdf/skill-sheet-document.tsx`）を返す。
- PDF 側も Web と同じ Markdown を入力とし、mdast → `@react-pdf` プリミティブへ変換して描画する（表レイアウトは `src/component/pdf/table-layout.ts`）。Web と PDF で描画元の Markdown を共有するため、二重メンテナンスを避けられる。

---

## まとめ

- 描画は remark-gfm / remark-breaks → rehype-raw → rehype-sanitize → rehype-slug の順で、生 HTML も必ずサニタイズを通す。
- `SANITIZE_SCHEMA` は `<details>`/`<summary>` と http(s) 画像のみを追加許可し、`isSafeImageSrc()` で二重防御する。
- コード/テーブル/画像は `components` で安全にカスタム描画し、DB ブロックは種別ごとに Markdown か専用コンポーネントへ振り分ける。
- PDF は `@react-pdf/renderer` をクライアント動的 import し、`toBlob()` でダウンロードする。

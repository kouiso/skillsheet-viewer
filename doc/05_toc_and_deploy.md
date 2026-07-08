# 05. 目次とデプロイ

このドキュメントでは、見出しから自動生成する目次（TableOfContents）と、Vercel + Neon による本番デプロイを解説する。

関連ドキュメント: [01 セットアップとルーティング](01_setup_and_routing.md) / [04 Markdown 表示](04_markdown_display.md)

---

## Part 1: 目次（TableOfContents）

### 見出しの抽出

目次は正規表現ではなく **描画済み DOM から見出しを抽出**する。`rehype-slug`（[04](04_markdown_display.md)）が付与した id をそのまま利用できるため、目次のリンク先と本文アンカーが確実に一致する。

`apps/web/src/component/skill-sheet-viewer.tsx` の `useEffect` が本文コンテナ（`contentRef`）配下を走査する。

```tsx
// skill-sheet-viewer.tsx（抜粋・要約）
const extractHeadings = () => {
  const els = container.querySelectorAll('h1, h2, h3, h4, h5, h6');
  const extracted = Array.from(els)
    .filter((el) => el.id)
    .map((el) => ({ id: el.id, text: el.textContent || '', level: parseInt(el.tagName.substring(1), 10) }));
  // シグネチャ比較で内容不変なら setState を抑止（再描画→再抽出の無限ループ防止）
};
extractHeadings();
const observer = new MutationObserver(extractHeadings);
observer.observe(container, { childList: true, subtree: true });
```

- `MutationObserver` で本文の変化に追従し、見出しの増減に合わせて目次を更新する。
- 抽出結果のシグネチャ（JSON 文字列）を保持し、内容が同じなら `setState` しない。再描画と再抽出のループを防ぐガードである。

### アクティブ見出しの追跡（IntersectionObserver）

現在スクロール位置にある見出しは `apps/web/src/hooks/use-active-heading.ts` の `useActiveHeading` が `IntersectionObserver` で追跡する。

```ts
// use-active-heading.ts（抜粋）
const observer = new IntersectionObserver(
  (entries) => entries.forEach((e) => { if (e.isIntersecting) setActiveId(e.target.id); }),
  { rootMargin: '-100px 0px -66% 0px', threshold: 0 },
);
```

- `rootMargin` で「ビューポート上部寄りに入った見出し」をアクティブと判定する。
- `rootRef` を渡すと探索を該当コンテナ配下に限定する。比較モードでは 2 つのビューアが同名見出し＝同一 id を持ちうるため、`document.getElementById` で引くと別ビューアの要素を掴んでしまう。`rootRef` 配下に scope することで干渉を防ぐ。

### 表示（TableOfContents コンポーネント）

`apps/web/src/component/table-of-contents.tsx` が目次 UI を描画する。

- **デスクトップ**: `sticky top-16` の左サイドバー（幅 `SIDEBAR_WIDTH = 280`）。`position: fixed` ＋固定 margin ではなく flex で隣接させ、折りたたみ時・印刷時にメインが自動で幅を詰める。折りたたみボタンを備える。
- **モバイル**（`max-width: 899px`）: 右下の FAB と、左から出る Sheet（Radix Dialog）で表示。項目クリックで自動的に閉じる。
- 見出しは `level` に応じてインデント（`INDENT_REM_PER_LEVEL`）とフォント（h1 は太字・やや大きめ）を変え、アクティブ項目はプライマリ色で強調する。framer-motion で出現をスタッガーアニメーションする。
- クリック時は `onHeadingClick`（`skill-sheet-viewer.tsx` の `scrollToHeading`）が該当要素へ `window.scrollTo({ behavior: 'smooth' })` で、ヘッダー分のオフセット（-80px）を差し引いてスクロールする。

比較モード（`compareMode`）と印刷時（`no-print`）は目次を非表示にする。

---

## Part 2: Vercel + Neon デプロイ

デプロイは Vercel のネイティブ GitHub 連携で行う（`vercel.json` によるリライトは不要。App Router がサーバー側でルーティングするため）。

### GitHub 連携

- Vercel プロジェクトを GitHub リポジトリに接続する。
- **本番デプロイ**: デフォルトブランチへの push。
- **プレビューデプロイ**: プルリクエスト（PR）ごとに preview URL が発行され、Neon と組み合わせて検証できる。
- Framework Preset は Next.js。ビルドは `pnpm build`（`apps/web` の `next build`）。

### 環境変数

Vercel のプロジェクト設定に、`SETUP.md` に列挙した変数を登録する。必須は `DATABASE_URL` / `SESSION_SECRET` / `VIEWER_CODE` / `BETTER_AUTH_SECRET` / `SKILLSHEET_OWNER_ID`（`assertServerEnv()` が起動時に検証）。GitHub シード副系統を使う場合のみ `GITHUB_TOKEN` / `GITHUB_OWNER` / `GITHUB_REPO` などを追加する。

### ランタイム DB 依存の動的化

`DATABASE_URL` はランタイム専用で、ビルド時には注入されない。DB を読むページは先頭で `connection()`（`next/server`）を呼び、`next build` の静的評価を避けてそのコンポーネント単位で動的レンダリングする（[01](01_setup_and_routing.md) 参照）。`env.ts` の `assertServerEnv()` もビルドフェーズ（`NEXT_PHASE === 'phase-production-build'`）では検証を no-op にして、secrets 未注入のビルドを壊さない。

---

## まとめ

- 目次は DOM から見出しを抽出し（`rehype-slug` の id を再利用）、`IntersectionObserver` でアクティブ見出しを追跡、`MutationObserver` で内容変化に追従する。
- 表示はデスクトップ sticky サイドバー / モバイル Sheet で切り替え、比較・印刷時は非表示。
- デプロイは Vercel ネイティブ連携（push=本番 / PR=preview）と Neon。DB 依存は `connection()` で動的化する。

---

## 実装方針追記（2026-06-21・完成プラン M0）

### デプロイ先
- Vercel を本番デプロイ先として確定（設定・デプロイ済）。preview deploy + Neon で検証する。
- ランタイム DB 依存（`DATABASE_URL`）はビルド時評価されないよう、DB ルートで `connection()` により動的化する。

### GitHub 読み経路（P0-FILEPATH）
- 主データ経路は DB（Neon）中心。GitHub 読み経路は副系統として維持する（後段で整備）。
- `GITHUB_FILE_PATH` は単一ファイル名だが `listSheets()` はディレクトリ列挙を行う。DB 中心運用では初回シードに限定して影響は小さい。GitHub 閲覧経路を使う場合のみ実レイアウトに合わせて設定する。

### DB マイグレーションの適用（P0-2）

デプロイ時の DB スキーマ適用は、対象 DB が「新規」か「既存本番」かで手順が分かれます。

- **新規（fresh）DB**: そのまま `pnpm db:migrate` を実行する。drizzle が全マイグレーションを正規手順で適用し、進捗管理テーブル `drizzle.__drizzle_migrations` も自動作成される。
- **既存本番 DB**: テーブルが Better Auth CLI などで先に作られており、`pnpm db:migrate` をそのまま流すと「テーブルが既に存在する」で失敗する。最初に **1 回だけ baseline** を行い、`0000_init` / `0001_deep_switch` を「適用済み」として登録してから通常運用に移す。

baseline の具体手順（確認用 SQL・登録 SQL・hash の出し方・推奨運用）は次のドキュメントにまとめてある:

- `packages/db/drizzle/MIGRATION-BASELINE.md`

baseline 後は、新規・既存どちらも `pnpm db:migrate` を通常のデプロイ手順として実行できる（新しいマイグレーションがある場合のみ適用される）。破壊的操作を含むため、本番 DB への実行前は Neon ブランチ等でバックアップを取ること。

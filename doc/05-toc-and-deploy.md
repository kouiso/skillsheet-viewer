# 05. 目次とデプロイ

このドキュメントでは、見出しから自動生成する目次（TableOfContents）と、Vercel + Neon による本番デプロイを解説する。

関連ドキュメント: [01 セットアップとルーティング](01-setup-and-routing.md) / [04 Markdown 表示](04-markdown-display.md)

---

## Part 1: 目次（TableOfContents）

### 見出しの抽出

目次は正規表現ではなく **描画済み DOM から見出しを抽出**する。`rehype-slug`（[04](04-markdown-display.md)）が付与した id をそのまま利用できるため、目次のリンク先と本文アンカーが確実に一致する。

`src/component/skill-sheet-viewer.tsx` の `useEffect` が本文コンテナ（`contentRef`）配下を走査する。

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

現在スクロール位置にある見出しは `src/hook/use-active-heading.ts` の `useActiveHeading` が `IntersectionObserver` で追跡する。

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

`src/component/table-of-contents.tsx` が目次 UI を描画する。

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
- Framework Preset は Next.js。ビルドは `pnpm build`（`next build`）。Root Directory は空（リポジトリルート）。

### 環境変数

Vercel のプロジェクト設定に、`setup.md` に列挙した変数を登録する。必須は `DATABASE_URL` / `SESSION_SECRET` / `VIEWER_CODE` / `BETTER_AUTH_SECRET` / `SKILLSHEET_OWNER_ID`（`assertServerEnv()` が起動時に検証）。GitHub シード副系統を使う場合のみ `GITHUB_TOKEN` / `GITHUB_OWNER` / `GITHUB_REPO` などを追加する。

Sentry/PostHog（監視・計測。任意）は `NEXT_PUBLIC_SENTRY_DSN` / `NEXT_PUBLIC_POSTHOG_KEY` / `NEXT_PUBLIC_POSTHOG_HOST` を Production・Preview に、`SENTRY_ORG` / `SENTRY_PROJECT` / `SENTRY_AUTH_TOKEN`（source map アップロード用）は **ビルド環境にのみ**登録する。「Enable access to System Environment Variables」を ON にしないと、キルスイッチが読む `NEXT_PUBLIC_VERCEL_ENV` が空になり無効化されたままになる。詳細は [doc/observability.md](observability.md)。

### ランタイム DB 依存の動的化

`DATABASE_URL` はランタイム専用で、ビルド時には注入されない。DB を読むページは先頭で `connection()`（`next/server`）を呼び、`next build` の静的評価を避けてそのコンポーネント単位で動的レンダリングする（[01](01-setup-and-routing.md) 参照）。`env.ts` の `assertServerEnv()` もビルドフェーズ（`NEXT_PHASE === 'phase-production-build'`）では検証を no-op にして、secrets 未注入のビルドを壊さない。

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

- `drizzle/migration-baseline.md`

baseline 後は、新規・既存どちらも `pnpm db:migrate` を通常のデプロイ手順として実行できる（新しいマイグレーションがある場合のみ適用される）。破壊的操作を含むため、本番 DB への実行前は Neon ブランチ等でバックアップを取ること。

### 文書境界・runtime role の適用順序（P0-3）

`skillsheet_private.*` の文書境界と runtime の最小権限化は、`pnpm db:migrate` とは別の SQL で適用する。新規環境へのセットアップ順序は次の通り。この順序を崩すと `UNMAPPED_PRINCIPAL` / `ACCESS_DENIED` で全 read/write が止まる。

1. `pnpm db:migrate`（テーブル・カラム・制約の正本）
2. `psql -f script/sql/install-skillsheet-read-boundary.sql`（reader role・principals 表・read 関数）
3. `psql -f script/sql/install-skillsheet-write-boundary.sql`（writer role・write 関数）
4. `psql -f script/sql/install-runtime-role.sql`（runtime LOGIN role・EXECUTE 付与・principals 登録。`-v runtime_role=... -v runtime_password=... -v owner_id=<SKILLSHEET_OWNER_ID>` が必須）
5. `DATABASE_URL` を runtime role の接続文字列へ切り替えて redeploy

境界の健全性は `script/verify-document-db.sh` でまとめて検証できる（隔離クラスタを立てて migration → install → CAS・権限・restore まで実走する）。

### e2e 専用 DB の運用（#346 / #360）

CI の e2e は本番と同じ Neon プロジェクト内の**別データベース** `skillsheet_e2e` を使う。接続文字列は GitHub secret の `E2E_DATABASE_URL` に置き、workflow では `DATABASE_URL` へコピーして各ステップに渡す（正本 `DATABASE_URL` / `neondb` を e2e が触ることはない）。ローカルでは `.env.e2e` の `E2E_DATABASE_URL` で切り替える（`playwright.config.ts` が `DATABASE_URL` を上書きする）。

e2e 実行ごとに `bootstrap-owner.ts` が一時オーナーを作成し `skillsheet_private.principals` の写像を張り替えるため、行・セッション・シートが蓄積する。これを消すため、ci.yml の `Migrate database` 直前に **`Reset E2E database`** ステップが入る。

- `pnpm exec tsx script/reset-e2e-db.ts` が標準経路として **DROP DATABASE + CREATE DATABASE** を実行する（extension・grant・`drizzle.__drizzle_migrations` を含む全状態を消去）。DROP は対象 DB へ接続したまま打てないため、同一エンドポイントの保守 DB（`neondb` → `postgres` → `template1` の順で最初に繋がるもの）経由で発行する。保守 DB 内のデータには触れない。
- 接続 role に CREATEDB が無い等で DB 単位の作り直しができない場合は、`public` / `drizzle` / `skillsheet_private` の DROP CASCADE + `public` 再作成へ自動フォールバックする。本アプリのオブジェクトはすべてスキーマ配下のため結果は同等。
- 誤爆防止として、URL の dbname が `*_e2e` で終わらない場合はスクリプトが拒否する（`neondb` / `postgres` / `template*` は常に拒否）。
- リセット後は schema 不在になるため、続く `Install document boundary` ステップは「完全 install」経路を通る。boundary role（`skillsheet_document_reader/writer`）は cluster 全域で共有され残るため、install SQL には `-v allow_existing_role=on` を渡して既存 role を再利用する（role は共有・schema は DB 単位、という非対称への対応）。
- boundary install 後の権限付与は、workflow 内で一時的に `GRANT skillsheet_document_reader/writer TO CURRENT_USER` → `SET ROLE` → `GRANT USAGE/EXECUTE` + `principals` upsert → `REVOKE`（membership の貸し出しと返却）という経路を取る。接続ユーザーへの直接 membership は残さない（SET ROLE 迂回による境界関数 bypass を防ぐため）。
- `skillsheet_e2e` は全 PR/実行で共有の1本なので、ci.yml の e2e 脚は job レベルの `concurrency`（`e2e-shared-db` グループ）で直列化する。同時実行すると互いが相手の DB を drop して両方失敗する。待機枠は1つのため、立て続けに来た実行は古い待機側がキャンセルされる（re-run で復帰）。

Neon branch を毎回作る案（案A）は `NEON_API_KEY` secret が未設定のため未採用。branch は親のデータを copy-on-write で引き継ぐため、残渣を抱えた DB を派生させるだけになり、真に fresh な DB には branch 上で別 DB を作る必要がある。API key を用意しても管理コストが上がるだけで、現行の drop+create と効果は変わらない。

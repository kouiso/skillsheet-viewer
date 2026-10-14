# FINAL-332 — PR#332 (WI-293) unwrapEmphasis before/after スクショ撮り直し

作業 dir: `/workspace/q07-retake-332/repo`（isolated clone、HEAD = PR head `7406de4`、branch `pr-332`）
before 用 worktree: `/workspace/q07-retake-332/wt-before`（base = `7406de4^2` = `c86437f`）
出力: `/workspace/q07-retake-332/out/`
push / PRコメント / merge / git commit は一切していない。

## 使った commit

- **after（PR head）**: `7406de4d185480cc14d7afc4c0d78c746238c9c3` — `/workspace/q07-retake-332/repo`
- **before（base）**: `c86437f`（`7406de4^2`、PR head 作成時点の main）— `/workspace/q07-retake-332/wt-before`（git worktree）
- base→head の差分: `src/db/text.ts`（unwrapEmphasis を1行ずつ判定へ）、`src/db/text.test.ts`、`e2e/pdf-print-view.spec.ts` のみ

## 手順

1. `git worktree add /workspace/q07-retake-332/wt-before c86437f`、両側で `pnpm install --frozen-lockfile`
2. ローカル PostgreSQL（127.0.0.1:5432、`skillsheet-local-stack` 既存インスタンス）に
   `sv332_before` / `sv332_after` を作成し、各チェックアウトの `drizzle/migration/*.sql`（6件）を適用。
   アプリの `@neondatabase/serverless` は既存の TLS WSS→pg プロキシ（127.0.0.1:443）経由で接続
   （`NODE_EXTRA_CA_CERTS=/var/lib/postgresql/skillsheet-local-stack/cert/ca-combined.crt`）。
   本番 DB には接続していない（`DATABASE_URL` は 127.0.0.1 宛）。
3. 架空シートを seed（`script/seed-332.ts` を各チェックアウトに追加＝untracked）。
   案件「オンライン審査基盤の開発（架空案件）」の `comment` に3パターンの `**` を混入:
   - 独立段落の太字小見出し `**主な担当領域**`（前後が空行）
   - 文中インライン太字 `**オンライン審査**` / `**品質基準**`
   - 段落途中の太字行 `**利用者待ち時間の削減**`（前後が非空行）
   seed で埋め込んだ raw 値は `**` 付きのまま。
4. リポジトリ本物の `script/unwrap-emphasis.ts`（SHEET_ID だけ差し替え）を各チェックアウトで
   `pnpm exec tsx script/unwrap-emphasis.ts --write` 実行し、各バージョンの unwrapEmphasis で
   保存値を変換（本物の変換経路）。
5. `.env.local`（各チェックアウト、gitignore 済み・ローカル専用ダミー値）:
   `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/sv332_{before,after}?sslmode=disable`、
   `VIEWER_CODE=view123`、`SKILLSHEET_OWNER_ID=owner` ほか。
6. `pnpm dev -p 3000` を before → after の順に起動し、Playwright（Chromium=/usr/bin/google-chrome、
   1280×960）で `/view/db/<sheet-id>` を撮影。閲覧 cookie は `POST /api/trpc/auth.login`（code=view123）で取得。
   コメントはプレビュー2段落で切れるため「続きを読む」を押して全文表示後に撮影。

## テーマ切替の確認方法（前回NG対策）

- 初回: `colorScheme: dark` + localStorage `theme-mode` 事前注入だけでは `.dark` が残らなかった。
  原因は `ThemeModeProvider` の mount effect 順序（dev の StrictMode 二重実行で、初期 mode='light' の
  sync effect が localStorage を 'light' に上書きして `.dark` を剥がす競合）。
- 対策: アプリ実装の「テーマ切り替え」ボタン（`viewer-topbar` → `toggleTheme`）を実際に押して
  ダーク化し、`document.documentElement.classList.contains('dark')` と
  `getComputedStyle(document.body).backgroundColor` を実測してから撮影した。
- 実測値: light = `rgb(246, 248, 248)` / card `rgb(255,255,255)`、dark = `rgb(10, 13, 15)` /
  card `rgb(15,19,22)`、`.dark` クラス有無も両者で確認。同一画像問題は解消済み。

## 撮影対象データ（全て架空）

- シート「unwrapEmphasis 検証シート（架空）」/ 人物「検証 太郎（架空）」/ 会社「架空デモ株式会社」
- before DB シートID: `91407016-84ec-4344-a35a-2675bdc81c46`（sv332_before）
- after DB シートID: `2522aea0-8eab-43d4-9d0f-c2645da752da`（sv332_after）

保存値の差分（psql で直接確認済み）:
- before: 独立段落の `**主な担当領域**` → `主な担当領域`（`**` 消失）
- after: `**主な担当領域**` が保存値に残る。インライン太字・段落途中の太字行は両者とも `**` 消失

## 各画像と写っている内容

| file | URL | 写っている内容 |
|---|---|---|
| before-light.png | `/view/db/91407016-84ec-4344-a35a-2675bdc81c46`（before コード / light） | 案件カード「コメント」全文。`主な担当領域` が地の文（太字消失）。インライン太字も `**` 無しで表示 |
| before-dark.png | 同上（dark） | 同上のダーク配色版（bg #0a0d0f 系） |
| after-light.png | `/view/db/2522aea0-8eab-43d4-9d0f-c2645da752da`（after コード / light） | 「コメント」内 `主な担当領域` が太字で残る。`オンライン審査`/`品質基準`（インライン）は `**` 無し地の文、段落途中の `利用者待ち時間の削減` も太字にならず段落に連結 |
| after-dark.png | 同上（dark） | 同上のダーク配色版 |
| before-card-{light,dark}.png / after-card-{light,dark}.png | 同上 | 案件カード部分の拡大カット（補助） |

DOM 証拠（撮影スクリプトが `article strong` を列挙して記録）:
- before: `strongs: []`（小見出し含め太字要素ゼロ）
- after: `strongs: ["主な担当領域"]`（独立段落の小見出しのみ `<strong>` 化。インライン・段落途中は unwrap 済みなので strong にならない）

## md5sum（重複なし）

```
6207f89b5e0ac56a15ab2a52df660709  out/after-card-dark.png
20b7ccb371e867842a04c9bcebc7d69c  out/after-card-light.png
45971186568a5f87916073665a8103e3  out/after-dark.png
7477267586d13597e2a4f37fb0a2b2e5  out/after-light.png
e4ed3cca6bbd61ebcb3c25ca4985e9bd  out/before-card-dark.png
33d0c85ede6453a0ad5faff2f1240548  out/before-card-light.png
8074fc44ef5ebad874f5184da0462fb3  out/before-dark.png
8e0a497f38db214ee69cd19fa24f0ea6  out/before-light.png
```

## その他の成果物・状態

- `out/dev-before.log` / `out/dev-after.log`: 各 dev サーバーのログ（`/view/db/<id>` は 200）
- 撮影スクリプト原本: `/workspace/q07-retake-332/capture.mjs`（両チェックアウトに `capture-332.mjs` として複製して実行）
- 作業用に加えた未コミットのローカル変更: `script/seed-332.ts`（新規・架空データのみ）、
  `script/unwrap-emphasis.ts` の SHEET_ID 差し替え、`.env.local`（ダミー値のみ）、`capture-332.mjs`。
  git commit / push / merge / PR コメントは実施していない。

## 未達・注意事項

- なし。before/after で小見出し行の残り方の差（before: 小見出しが地の文に化ける / after: 太字で残る）、
  light/dark の配色差、md5 重複なし、架空データのみ、の全条件を満たす。
- dev サーバーは撮影後に停止済み。`wt-before` worktree と DB（sv332_before/after）は検証再現用に残置。

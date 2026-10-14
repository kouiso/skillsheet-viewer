# FINAL-430b — PR#430 before/after スクショ撮り直し

作業 dir: `/workspace/q07-retake-430b/repo`（a47db96、isolated clone。push / PR コメント / merge / commit なし）
出力: `/workspace/q07-retake-430b/out/`

## 結論

- before 6枚（Issues パネル展開・`ACCESS_DENIED` 可読）: 達成
- after 6枚（正常描画）: 達成
- `dev-before.log`: 同一 run のログに `ACCESS_DENIED` 50 件 / `42501` 18 件

## before 状態の作り方（重要）

PR#430（merge commit `f30fb0f`、修正本体 `a0646ec`）は `dev-local-stack.sh` に
「境界 install + 接続 role への EXECUTE/USAGE + `skillsheet_private.principals` 写像」を
追加した。before は「この権限付与ステップを適用しない DB」で再現した。

- DB: ローカル PostgreSQL（127.0.0.1:5432、既存の dev-local-stack 用インスタンス）に
  `skillsheet_before` を新規作成し、
  `drizzle/migration/*.sql`（13 件）と `script/sql/install-skillsheet-{read,write}-boundary.sql`
  を適用。`GRANT EXECUTE` と `principals` への `SESSION_USER → owner_id` 写像は
  **適用していない**（`dev-local-stack.sh` の `ensure_boundary` の付与ブロック相当をスキップ）。
- この状態で `postgres`（superuser）が `skillsheet_private.*` を呼ぶと、関数内の
  principals 検索に引っかかり `UNMAPPED_PRINCIPAL`（SQLSTATE 42501）→
  `document-service.ts` が `ACCESS_DENIED` に変換 → tRPC `INTERNAL_SERVER_ERROR` →
  画面は error.tsx、dev overlay の Issues に `TRPCError: ACCESS_DENIED` が出る。
  （境界 SQL 自体も未 install にすると `schema does not exist`（3F000）になり
  ACCESS_DENIED が出ないため、issue #373 記載の「権限未付与」症状に合わせて
  install 済み・権限未付与の状態を取った）

- `.env.local`（gitignore 済み・ローカル専用ダミー値のみ）:
  `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/skillsheet_before?sslmode=disable`、
  `VIEWER_CODE=view123`、`SKILLSHEET_OWNER_ID=y2RWqwzPffrwscdAwKUF9ibmbS3w0i8e` ほか。
- 443 の TLS→pg WebSocket プロキシは既存 listener を再利用
  （`script/wss-pg-proxy.mjs` 相当、pid 3072340 が起動済みだった）。
- 起動: `NODE_EXTRA_CA_CERTS=/var/lib/postgresql/skillsheet-local-stack/cert/ca-combined.crt pnpm dev 2>&1 | tee out/dev-before.log`（Next.js 16.3.8 Turbopack、http://127.0.0.1:3000）
- 認証: 閲覧 cookie は `POST /api/trpc/auth.login`（code=view123）で取得。
  編集者は `script/bootstrap-owner.ts` で架空アカウント `devin-verify@example.invalid` を
  before DB に作成し `POST /api/auth/sign-in/email` で cookie 取得。
- 撮影: Playwright（Chromium=/usr/bin/google-chrome、1440x900）で各 URL に遷移後、
  dev overlay の「Open issues overlay」→ 先頭 issue を展開した状態で撮影。

## 各画像と URL（before）

| file | URL | 写っている内容 |
|---|---|---|
| before-01.png | `/view` | スキルシート一覧。Issues ダイアログ展開。「Console TRPCError / Server / **ACCESS_DENIED**」、`documentCall`（sheet.ts:48）のコードフレーム、Call Stack に SheetsListPage。バッジ「2 Issues」 |
| before-02.png | `/view/db` | 既定シート。Issues 展開で **ACCESS_DENIED**、`document-service.ts:99` の `'42501'` を含むコードフレーム、`getCachedDbSheet` 系スタック。2 Issues |
| before-03.png | `/view/db/11111111-2222-4333-8444-555555555555` | ID 指定シート。Issues 展開で **ACCESS_DENIED**、`42501` コードフレーム、`getCachedDbSheetById` スタック。2 Issues |
| before-04.png | `/view/db/22222222-3333-4444-8555-666666666666` | 同上（別 ID）。**ACCESS_DENIED** + `42501`。2 Issues |
| before-05.png | `/builder` | ビルダー（編集者ログイン済み）。Issues 展開で **ACCESS_DENIED**、`BuilderPage` スタック。1 Issue |
| before-06.png | `/builder?sheet=11111111-2222-4333-8444-555555555555` | 同上（sheet 指定）。**ACCESS_DENIED**。1 Issue |

`/view/db/[id]` の UUID は zod の RFC variant 検証を通す v4 形式を使用（初回の `...-3333-4444-...` 形式は variant 不正で BAD_REQUEST→404 になったため修正済み）。

## 各画像と URL（after）

同一チェックアウト（a47db96 は merge `f30fb0f` を含む＝修正適用済み）＋権限付与済み DB
`skillsheet_after`（migrations + 境界 install + `GRANT EXECUTE`/`USAGE` + principals 写像を
`dev-local-stack.sh` の `ensure_boundary` と同じ SQL で適用）に切り替えて撮影。
シードは架空データのみ（`src/db/fixture/fictional-demo.ts` 経由 `script/seed-console-demo.ts`、
「Console デザイン検証シート」×2）。編集者アカウントも同じ架空アカウントを同 ID で作成。

| file | URL | 写っている内容 |
|---|---|---|
| after-01.png | `/view` | シート一覧に架空シート 2 件が表示 |
| after-02.png | `/view/db` | 既定シート「見本 花子（架空）」が描画 |
| after-03.png | `/view/db/296e3262-a367-4a7f-b2ae-ced93610c090` | 架空シートの本文が描画 |
| after-04.png | `/view/db/fdd2bd63-728c-4923-8682-bda97fe18093` | 2 枚目の架空シートが描画 |
| after-05.png | `/builder` | ビルダー編集画面（架空シート読み込み済み） |
| after-06.png | `/builder?sheet=296e3262-a367-4a7f-b2ae-ced93610c090` | 同上（sheet 指定で同一シートを編集） |

## dev-before.log の該当行（同一 run）

```
$ grep -cE 'ACCESS_DENIED' out/dev-before.log → 50
$ grep -cE '42501' out/dev-before.log → 18

17:Failed to fetch DB sheets: Error [TRPCError]: ACCESS_DENIED
30:⨯ Error [TRPCError]: ACCESS_DENIED
75:[browser] Route error boundary: TRPCError: ACCESS_DENIED
95:Failed to load DB skill sheet: Error [TRPCError]: ACCESS_DENIED
104:   98 |       if (record(error) && (error.code === '42501' ...
105:>  99 |         throw new DocumentError('ACCESS_DENIED');
111:  [cause]: Error [DocumentError]: ACCESS_DENIED
126:    code: 'ACCESS_DENIED',
130:⨯ Error [TRPCError]: ACCESS_DENIED
```

## 正直な注記・未達相当

- 「権限付与/install を適用しない」を厳密に「境界 SQL も未適用」と取ると、エラーは
  `schema "skillsheet_private" does not exist`（3F000）になり ACCESS_DENIED が出ない。
  終了条件（画面に ACCESS_DENIED が読めること）と Issue #373 の症状（42501）に合わせ、
  before は「install 済み・GRANT/principals 未適用」で再現した。これは PR 本体が
  「権限未付与だと 42501 で全滅する」と記述している状態に一致する。
- `/view/[path]`（GitHub 経路）・`/viewer-auth`・`/login`・`/consent` は文書境界を
  呼ばないため ACCESS_DENIED を出せず、6画面には含めていない（対象外）。
- after の `/builder`（05/06）は左下に「1 issue」バッジが残る。内容は React の
  hydration mismatch 警告（dev-after.log の `react.dev/link/hydration-mismatch`）で、
  既存のアプリ側の警告であり本タスクの変更によるものではない。
- `dev-local-stack.sh up` は root 専有の STATE_DIR（`/var/lib/postgresql/skillsheet-local-stack`）
  に対する `chown`/`su postgres` を非 root の本ユーザーでは実行できないため、
  after DB はスクリプトと同じ SQL 手順を psql で手作業適用した（結果は同等）。
- 表示データは全て架空（fictional-demo.ts の「見本 花子（架空）」等）。実データは不使用。

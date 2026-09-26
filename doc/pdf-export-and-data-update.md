# PDF 出力と本番データ更新の手順

PDF の正本は本番 DB。単独の組版スクリプトを手で調整して代わりにしない。DB を直してアプリか repo の印刷コードで出す。

URL・閲覧コード・ログイン・DB の在処は [doc/onboarding.md](./onboarding.md) の「本番環境と接続先」にある。
ここには手順だけを書く。接続文字列や DB のパスワードはこのファイルにもコミットにも書かない。

## 本番 DB へのつなぎ方（下の 2 つの手順で共通）

接続文字列もデータもコマンドの引数には書かない。引数は同じ端末の別ユーザーから `ps` で見える。
接続文字列を権限 600 の `.conn` に置き、psql のサービスファイルに変換して使う。
`.conn` と `.pg_service.conf` はコミットせず、作業が終わったら消す。

```sh
umask 077
op read 'op://RITMO/skillsheet-viewer Neon DATABASE_URL/password' > .conn
```

アイテム名は [doc/onboarding.md](./onboarding.md) の表にある「skillsheet-viewer Neon DATABASE_URL」。
シークレットのフィールド名は `password`（値は出さずにアイテムの構造だけ確認済み）。

```sh
umask 077
node -e '
const u = new URL(require("fs").readFileSync(".conn", "utf8").trim());
const d = decodeURIComponent;
process.stdout.write(["[sheet]", `host=${u.hostname}`, `port=${u.port || 5432}`, `dbname=${d(u.pathname.slice(1))}`,
  `user=${d(u.username)}`, `password=${d(u.password)}`, "sslmode=verify-full", ""].join("\n"));
' > .pg_service.conf
export PGSERVICEFILE="$PWD/.pg_service.conf"
```

以降は `psql service=sheet` でつながる。`sslmode=require` は証明書もホスト名も検証しない。Neon の証明書は
公開 CA 発行なので、OS 標準の CA ストアがあれば `verify-full` で追加設定は要らない。

## PDF を出す（ローカルで印刷コードを直接呼ぶ）

`pnpm dev` も `pnpm build` も、ブラウザからの書き出しも要らない。アプリの PDF 出力と同じ
`buildPrintSkillSheetDocument` を `tsx` で呼ぶので、出てくる PDF はアプリから書き出したものと同じ組版になる。

**前提（この2つを満たさないシートには使わない）**: アプリ側の `createSkillSheetPdf`
（`src/component/pdf-export.tsx`）はブロックが profile/skills/stats/project 以外（markdown・table・
experience 等）を含むと、この構造描画ではなく旧 markdown 経路にフォールバックする。下のスクリプトは
常に構造描画を使うため、対象外のブロック型が混じると markdown/table/experience ブロックが黙って
描かれない。また `generateSkillSheetPdfBlob`（`src/lib/generate-skillsheet-pdf.ts`）が行う案件期間の
矛盾チェック（`PdfDurationConflictError`）も、下のスクリプトは呼ばない。案件の参画期間の月数を
誤って出す可能性があるので、使う前に対象シートのブロックが上の4種のみであることと、期間の矛盾が
無いことを確認する。
タイトルはスクリプト側で `エンジニアスキルシート` に固定している（アプリは `skill_sheets.title` を渡す）。
影響は PDF メタデータの Title のみ（`pdfinfo` で確認済み）で、本文の組版には出ない。

### 1. ブロックを JSON に書き出す

シート ID は `public.skill_sheets` で確認する。ブロックが 0 件でも `[]` が出るよう `COALESCE` で包んである。

```sh
psql service=sheet -tA -c "SELECT COALESCE(json_agg(json_build_object('id',id,'type',type,'order',\"order\",'data',data) ORDER BY \"order\"), '[]'::json) FROM public.blocks WHERE sheet_id='<シート ID>'" > blocks.json
```

CI の実データ検査（`.github/workflows/pdf-layout-check.yml`）は、同じ用途に `script/dump-block.ts` を使っている。

### 2. 印刷コードを呼ぶ

次の 2 ファイルをリポジトリ直下に置く。どちらもコミットしない。

`tsconfig.render.json`:

```json
{ "extends": "./tsconfig.json", "compilerOptions": { "jsx": "react-jsx" } }
```

`render-print-pdf.tsx`:

```tsx
import { readFileSync } from 'node:fs';
import { Font, renderToFile } from '@react-pdf/renderer';
import PDF_FONT_FAMILY from '@/component/pdf/constant';
import { splitForHyphenation } from '@/component/pdf/font';
import { buildPrintSkillSheetDocument } from '@/component/pdf/print-document';
import { BOLD_TTF, REGULAR_TTF } from '@/component/pdf/test-font-path';
import { currentMonthKey } from '@/db/derived-display';

const [, , blocksPath, outPath] = process.argv;
Font.register({
  family: PDF_FONT_FAMILY,
  fonts: [
    { src: REGULAR_TTF, fontWeight: 400 },
    { src: BOLD_TTF, fontWeight: 700 },
    { src: REGULAR_TTF, fontWeight: 400, fontStyle: 'italic' },
    { src: BOLD_TTF, fontWeight: 700, fontStyle: 'italic' },
  ],
});
Font.registerHyphenationCallback(splitForHyphenation);
const blocks = JSON.parse(readFileSync(blocksPath, 'utf8'));
// 経験年数の基準月。アプリと同じく東京時間の当月にする。
// 過去の月の版を出し直すときだけ year * 12 + (month - 1) を直接入れる（2026年9月なら 2026 * 12 + 8）。
const referenceMonth = currentMonthKey();
const doc = await buildPrintSkillSheetDocument({ title: 'エンジニアスキルシート', blocks, views: undefined, referenceMonth });
await renderToFile(doc, outPath);
```

```sh
pnpm exec tsx --tsconfig tsconfig.render.json render-print-pdf.tsx blocks.json out.pdf
```

### 3. 全ページを見る

出した PDF は全ページを画像にして目で見る。文字化けや重なりに加えて、スキル一覧やプロフィールが
次のページへ 1 行だけこぼれていないかも見る。こぼれはコードではなく中身の量で起きることが多く、
その場合は下の手順でデータを直す。

## 本番 DB のブロックを直す

1. 退避する。Neon で `main` から `backup-before-<内容>-<日付>` ブランチを切る。ブランチ数の上限で切れないときは、
   対象シートの `public.blocks` と `public.skill_sheets` の行を JSON に書き出して残す（戻すときはその JSON を同じ手順で書く）。
2. 下の SQL の `apply.sql` が要る値（各ブロックの変更前 `md5(data::text)` と現在の版）を読む。

   ```sql
   SELECT id, "order", md5(data::text) FROM public.blocks WHERE sheet_id='<シート ID>' ORDER BY "order";
   SELECT revision FROM public.skill_sheets WHERE id='<シート ID>';
   ```

3. 1 トランザクションで書く。変えるブロックごとに `md5(data::text)` が変更前の値と一致する行だけを更新し（CAS）、
   `skill_sheets.revision` を「現在の版 → +1」で上げる。どちらかの更新行数がずれたら例外を投げて全部戻す。
   別の編集が先に入っていたら、何も書かずに止まる。
4. 新しい data は `apply.sql` の中で `` \set new_1 `cat new-1.json` `` として読む（引数に JSON を出さない）。
   psql の `:'変数'` は `DO $$ … $$` の中では展開されないので、いったん一時テーブルに入れ、
   DO ブロックからはそのテーブルを読む。
5. 本番の前に、同じ SQL の `COMMIT;` を `ROLLBACK;` に替えて一度流し、通ることを確かめる。
6. 書いたあと読み戻し、手元の JSON と全ブロックが一致することを確かめてから PDF を出す。

```sql
-- 変えるブロックの数だけ \set と INSERT の行を足す。pre は変更前の md5(data::text)
\set new_1 `cat new-1.json`
BEGIN;
CREATE TEMP TABLE nd(id uuid, d jsonb, pre text) ON COMMIT DROP;
INSERT INTO nd VALUES ('<ブロック ID>'::uuid, :'new_1'::jsonb, '<変更前の md5>');
DO $$
DECLARE v bigint; n int;
BEGIN
  SELECT revision INTO v FROM public.skill_sheets WHERE id = '<シート ID>' FOR UPDATE;
  IF v <> <現在の版> THEN RAISE EXCEPTION 'REVISION_MOVED %', v; END IF;
  UPDATE public.blocks b SET data = nd.d FROM nd
    WHERE b.id = nd.id AND b.sheet_id = '<シート ID>' AND md5(b.data::text) = nd.pre;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> (SELECT count(*) FROM nd) THEN RAISE EXCEPTION 'BLOCK_CAS_FAILED %', n; END IF;
  UPDATE public.skill_sheets SET revision = revision + 1, updated_at = now()
    WHERE id = '<シート ID>' AND revision = <現在の版>;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'REVISION_CAS_FAILED'; END IF;
END $$;
COMMIT;
```

```sh
psql service=sheet -v ON_ERROR_STOP=1 -f apply.sql
```

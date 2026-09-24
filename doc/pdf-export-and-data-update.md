# PDF 出力と本番データ更新の手順

URL・閲覧コード・ログイン・DB の在処は `CLAUDE.md` の「PDF 出力・閲覧・本番データ更新の在処」にある。
ここには手順だけを書く。接続文字列やパスワードはこのファイルにもコミットにも書かない。

## PDF を出す（ローカルで印刷コードを直接呼ぶ）

`pnpm dev` も `pnpm build` も、ブラウザからの書き出しも要らない。アプリの PDF 出力と同じ
`buildPrintSkillSheetDocument` を `tsx` で呼ぶので、出てくる PDF はアプリから書き出したものと同じ組版になる。

### 1. ブロックを JSON に書き出す

接続文字列は権限 600 のファイル（例: `.conn`）に置き、使い終わったら消す。
シート ID は `public.skill_sheets` で確認する。

```sh
umask 077
psql "$(cat .conn)" -tA -c "SELECT json_agg(json_build_object('id',id,'type',type,'order',\"order\",'data',data) ORDER BY \"order\") FROM public.blocks WHERE sheet_id='<シート ID>'" > blocks.json
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
// 経験年数の基準月。year * 12 + (month - 1)。2026-09 なら 2026 * 12 + 8。
const referenceMonth = 2026 * 12 + 8;
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
2. 1 トランザクションで書く。変えるブロックごとに `md5(data::text)` が変更前の値と一致する行だけを更新し（CAS）、
   `skill_sheets.revision` を「現在の版 → +1」で上げる。どちらかの更新行数がずれたら例外を投げて全部戻す。
   別の編集が先に入っていたら、何も書かずに止まる。
3. psql の `:'変数'` は `DO $$ … $$` の中では展開されない。新しい data はいったん一時テーブルに入れ、
   DO ブロックからはそのテーブルを読む。
4. 本番の前に、同じ SQL の `COMMIT;` を `ROLLBACK;` に替えて一度流し、通ることを確かめる。
5. 書いたあと読み戻し、手元の JSON と全ブロックが一致することを確かめてから PDF を出す。

```sql
BEGIN;
CREATE TEMP TABLE nd(id uuid, d jsonb, pre text) ON COMMIT DROP;
-- 変えるブロックの数だけ行を足す。pre は変更前の md5(data::text)
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
psql "$(cat .conn)" -v ON_ERROR_STOP=1 -v new_1="$(cat new-1.json)" -f apply.sql
```

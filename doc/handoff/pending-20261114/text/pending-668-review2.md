REVIEW | reviewer: Opus 5.5 (fresh agent) | authored no commit on this PR | head 87f7ed2733e3d200c19b229bcc4b398e8a7fd794 | axes: correctness, tests, a11y, board match, body accuracy | verdict FAIL | must 1 want 1 nit 2

確認を終えた時刻: 2026-11-14T14:14Z（`date -u`）。作業場は `/home/user/wt/668r`（detached 87f7ed2、node_modules は /home/user/wt/668 への symlink）。

## must

1. **案件の多い会社を削除するとき、確認ダイアログのボタンが画面の外に出てしまう（前の版からの劣化）。** `app/builder/use-workspace-confirm.tsx:181`
   - 何が起きるか: 前の版は `details` を `Dialog.Content`（`flex-col max-h-[90dvh]`、163 行目）の直下に置き、`min-h-0 overflow-y-auto` で一覧だけがスクロールしていた。今回 `details` を `<div className="flex flex-col gap-2.5 pl-0 sm:pl-11">` で包んだが、この包みに `min-h-0` が無い。flex の子の `min-height: auto` が効いて包みが中身の高さより縮まないため、`details` はスクロールしなくなる。`Dialog.Content` は `max-h` で止まり、`overflow` も指定していないので、題名とボタンが枠の外にはみ出す。`details` を渡しているのは `app/builder/project-editor.tsx:417`（会社と案件を削除。関連する案件の一覧）。ボード `solo-del-co` の一覧にも 5 件以上の案件が並んでいる。
   - 再現（同じ CSS 構造を Chromium で組んだ。スクリプトは `/tmp/claude-0/-home-user/8859ff81-4b08-5d37-a3da-246d31bf85b4/scratchpad/668r2/ovf.mjs` と `/tmp/claude-0/-home-user/8859ff81-4b08-5d37-a3da-246d31bf85b4/scratchpad/668r2/thr.mjs`）:
     - 1440×900・60 件のとき、前の版はフッターの下端が 855px で一覧がスクロールする。今回の版はフッターの下端が 1465px（画面の高さは 900）で、一覧はスクロールしない。
     - 390×844（20px の余白、44px のボタンを縦に 2 つ）のとき、20 件でフッターの下端が 903px になり、画面の外に出る。15 件では 770px で画面の中に収まる。
     - 包みに `min-height: 0` を足すと、前の版と同じ結果（フッターの下端 855px、一覧がスクロールする）に戻る。
   - 影響: マウスやタップでは「会社と案件を削除」と「やめる」に手が届かない。390 では題名も上に切れる。Esc と Tab で抜けることはできる。撮影は案件 2 件の会社でしか撮っていないので、この状態は撮影にも試験（jsdom はレイアウトを計算しない）にも出ていない。
   - 直し方: 181 行目を `flex min-h-0 flex-col gap-2.5 pl-0 sm:pl-11` にする（念のため `Dialog.Content` に `overflow-hidden` を足してもよい）。案件を 20 件ほど持つ会社で、390 と 1440 の削除ダイアログを撮って、ボタンが画面の中にあり一覧がスクロールすることを確かめる。jsdom では高さを測れないので、試験で守るなら「包みが `min-h-0` を持つ」ことをクラスで確かめる程度になる。

## want

1. **本文の実測の表と撮影は、長い一覧の場合を含んでいない。** 本文 34 行目「実画面の 6 種 … 24 枚すべてで同値」と 48 行目「横はみ出し なし」は、案件 2 件の会社で撮った結果。must 1 を直したあと、`details` が長い場合の 1 枚（390 で十分）を足すか、本文に「縦にはみ出す場合は一覧がスクロールする（N 件で確認）」と書き足す。

## nit

1. 390 では `flex-col-reverse` のため、見た目の上下と DOM の順（Tab の順）が逆になる（WCAG 1.3.2 / 2.4.3 の「意味のある順序」から少し外れる）。ボードの `.rv.m .dlg-f` をそのまま写した決定どおりなので、直す必要はない。記録のために書いておく。
2. `app/builder/history-drawer.tsx:39`「この時点に戻す」は今もゴミ箱のアイコンのまま。本文 16 行目で「ボードに無いものは触らない」決定として明記されているので、指摘は取り下げてよい（前回の nit 2 の扱いが決まっていることを確認しただけ）。

## 前回の指摘（must 1・want 4・nit 2）がどうなったか

| 前回 | 今回 |
|---|---|
| must 1 main より遅れている | 直っている。a89ed2a で main を取り込んだ。`git rev-list --count HEAD..origin/main` = 0（14:1x に fetch して確認） |
| want 1 競合のアイコンの形 | 直っている。`icon: 'reload'` を足し、path はボードと同じ `M13 3v3.5H9.5` / `M12.6 6.4A5 5 0 1 0 13 9`。`confirm-conflict-light-390.png` で矢印になっていることを目で確かめた |
| want 2 呼び出し側の試験が無い | 直っている。`builder-client.test.tsx` に 3 件。下の「試験」で、引数を外すと落ちることを自分で確かめた |
| want 3 実画面で撮っていない | 6 種は実画面（本番ビルドの `/builder`）で撮り直した。ボードに無い 3 種は部品単体のままで、本文 84〜86 行目にそう書いてある |
| want 4 #668 本文についての古い一文 | 直っている。96 行目は「直し済み」になった |
| nit 1 呼び出しの数 | 直っている。18 行目・32 行目が 10 か所 |
| nit 2 history のアイコン | 決定として本文に明記された（上の nit 2） |

## 軸ごとに見たもの

### 正しさ（呼び出し 10 か所の引数）
- builder-client.tsx の discard（250〜255 行目）は `danger` `icon:'warn'` `order:'danger-first'` `cancelVariant:'primary'`。empty（891〜895 行目）は `danger` `icon:'warn'` `cancelVariant:'primary'`。競合（963〜966 行目）は `icon:'reload'`、`danger` は無いので確認ボタンは主ボタン。
- シート削除・案件削除 2 か所・会社と案件を削除は `danger: true` だけで、既定の cancel-first・ゴミ箱アイコン・通常の取消になる。履歴系 3 つは変えていない。
- どれもボード（`solo-*` の `.dlg-f` の DOM 順と `pri` / `fv` / `dng`）と合う。discard は `[dng, pri fv]`、empty は `[pri fv, dng]`、del-co は `[fv, dng]`、競合は `[b, pri]`。
- 共通の値（最大幅 480・角丸 8 = `--radius-xl` 8px・余白 24/20・間隔 10・ボタン 36/44・390 では column-reverse）は、クラスと `668-results.json` の 24 行で一致した（本文の左は 69 = 24 + 44 + 枠線 1、390 では 21 = 20 + 1）。
- 劣化は must 1 の 1 件。

### 初期フォーカス・キーボード・a11y
- `onOpenAutoFocus` で取消ボタンにフォーカスする（並びを変えても `ref={cancel}` は取消側に付いている）。`668-results.json` でも 24 行すべてで取消側が `focus: true`。
- Esc は `onOpenChange(false)` から `finish(false)` に行く。外側のクリックは無視する。閉じたら `restoreFocus` で元の場所に戻す。どれも前と変わらない。
- `role="alertdialog"`。Radix の Title と Description で名前と説明が付く。アイコンの svg は `aria-hidden`。ボタンは `focus-visible:outline-2`。390 で見た目の順と DOM の順が逆になる点は nit 1。

### 試験
- `pnpm vitest run -c vitest.config.ts --maxWorkers=1 app/builder/use-workspace-confirm.test.tsx app/builder/builder-client.test.tsx`: 2 ファイル・69 件が通った。
- ミューテーション（`builder-client.tsx` を 1 か所ずつ変え、そのつど `git checkout --` で戻した。作業ツリーはきれい）:
  - discard の `order: 'danger-first'` を消す → 「未保存のまま移動」の 1 件が落ちる
  - empty の `cancelVariant: 'primary'` を消す → 「空のまま保存」の 1 件が落ちる
  - 競合の `icon: 'reload'` を消す → 「競合」の 1 件が落ちる
  - どれも本文 106 行目の説明と合っている。試験は効いている。
- 長い `details` で縦にはみ出す場合は、jsdom ではレイアウトを計算しないので試験では見られない（must 1）。

### ボードとの一致
- 上の「正しさ」のとおり。色は決定どおり範囲外なので見ていない。

### 本文と差分・画像
- 引数 3 つと既定、3 呼び出しへの追加、表の 10 か所、フォーカス、390 の並びの説明は、コードと画像と合っている。
- 画像は conflict-light-390（再読み込みの矢印、column-reverse で主ボタンが上）と discard-dark-1440（危険が左、「編集に戻る」が主ボタンでフォーカスの輪あり）を開き、ボードどおりだった。撮影の文言は合成データだけ。
- LOCAL-CHECK は head 87f7ed2・14:09Z。私は変わったファイルの試験だけを回した（lint・type-check・build・node・PDF は回していない）。
- 本文で足りないのは want 1（長い一覧の場合）だけ。

---
_Generated by [Claude Code](https://claude.ai/code)_

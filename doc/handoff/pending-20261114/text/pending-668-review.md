REVIEW | reviewer: general-purpose, opus 5.5 medium | authored no commit on this PR | head b8f3d8d10e1cc05d4865391d44c02ae5f8cf9576 | axes: pass line, design, scope, tests, body vs diff, evidence | verdict FAIL | must 1 want 4 nit 2

確認を終えた時刻: 2026-11-14T13:34Z（`date -u`、作業場 `/home/user/wt/668r`、detached b8f3d8d）。

## must

1. **ブランチが main より 1 コミット遅れている（合格ライン 1 を満たさない）。**
   `git log HEAD..origin/main` = `4d8ca74`（#664、`app/builder/builder-client.tsx` を触る）。merge-base は `94fe259`。
   `git merge-tree --write-tree HEAD origin/main` は終了コード 0（tree `3c31cc5`）で衝突なし。中身の問題ではなく、取り込み直しの作業だけ。
   直し方: main を取り込み、新しい head で lint・type-check・jsdom テストをやり直して、その head に LOCAL-CHECK を書く（PR 作成後は CI）。証拠リンクの短縮 SHA `b8f3d8d` も新しい head に合わせるか、b8f3d8d を指すことを本文に明記する。

## want

1. **競合ダイアログの見出しアイコンの形がボードと違う。** `app/builder/builder-client.tsx:959`（`icon: 'warn'`）と `app/builder/use-workspace-confirm.tsx:46`（warn は三角の形で固定）。
   ボード `solo-conflict-light/dark` は `.dlg-ic.warn` の中に**再読み込みの矢印**（`M13 3v3.5H9.5` / `M12.6 6.4A5 5 0 1 0 13 9`）を描いている。実装は三角の注意マーク（`confirm-conflict-light-390.png` で確認）。色の種類（warn）は合っている。
   本文の比較表（本文 48 行目）は「見出しのアイコン … 一致」と書いているので、本文と実物も合っていない。形を引数で選べるようにするか、本文で「競合の形はボードと違う（範囲外）」と明記する。

2. **呼び出し側の並び・見た目・アイコンを確かめる試験が無い。** `app/builder/use-workspace-confirm.test.tsx:101` 以降の 4 件は部品単体の試験。
   ミューテーションで確かめた結果:
   - 部品の `order` を無視させる → 1 件落ちる（並びの試験は効いている）
   - 初期フォーカスを確認ボタンへ移す → 6 件落ちる（フォーカスの試験は効いている）
   - **`builder-client.tsx` を main の版に戻す（discard・empty・競合の 3 呼び出しから引数を外す）→ `app/builder/` の 249 件すべて通る**
   受け入れ基準の「破壊的なダイアログの並びと最初のフォーカスがボードどおり」は、呼び出し側では撮影とコードを読むことでしか裏付けられていない。discard（危険が左・取消が主）と empty（取消が主）だけでも `builder-client.test.tsx` で並び・クラスを確かめる 1〜2 件を足すのが望ましい。
   また本文の「変更前の部品に差し替えると 4 件とも失敗」は事実だが、4 件とも `data-confirm-footer` が無いことで落ちるだけ。並びとフォーカスを本当に検出できるかは上のミューテーションで示した。

3. **撮影は実画面ではなく、使い捨ての検証ページ（コミットしていない）で撮っている。** 本文 61 行目。
   部品と `globals.css` は本物なので、ダイアログの見た目の証拠にはなる。ただし各ダイアログの `order` / `cancelVariant` / `icon` は検証ページ側で渡している。実際の呼び出し側が同じ値を渡すことは、上の 2 のとおり試験で守られていない。
   コードを読んだ範囲では、呼び出し 10 箇所すべてが撮影と同じ値を渡している（下の表）。合格ライン 5 の「実画面」をこれで満たすとするかは lead の判断に委ねる。少なくとも本文に「ビルダー画面上ではなく部品単体の撮影」と書かれているのは良い。

4. **本文の「#668 の本文の『空のまま保存』の記述は誤りで、manager が本文を直す」（77 行目）が古い。**
   #668 の本文（updated 2026-11-14T12:39:23Z）は既に「空のまま保存: 『やめる』（主）が左・『空のまま保存』（危険）が右」で、実装と一致している。この一文を消すか、「直し済み」に書き換える。

## nit

1. 本文 17 行目「呼び出し元の全件（11 呼び出し）」。実際の `confirm({` 呼び出しは 10 箇所（builder-client 6・project-editor 2・project-nav 1・history-drawer 1）で、表は 9 行（案件削除の 2 箇所を 1 行にまとめている）。数を 10 に直す。
2. `app/builder/history-drawer.tsx:39`「この時点に戻す」は `danger: true` なので、既定でゴミ箱のアイコンになる（`confirm-history-*.png`）。戻すのは削除ではないので、形として少しずれる。ボードに無いダイアログで、並びとフォーカスは今のまま（決定どおり）。`icon: 'warn'` を渡す方が意味に合う。任意。

## 軸ごとに見たもの

### 合格ライン
1. head に結び付いているか: b8f3d8d10e1cc05d4865391d44c02ae5f8cf9576 で確認。**main より 1 遅れている → must 1**。merge-tree で衝突なし。
2. 作者以外の判定: 本レビュー。must は 1。
3. CI: CI は `pull_request` と main への push でしか動かず、PR がまだ無いので b8f3d8d に CI の実行は無い。check-runs は「Deployed CSS matches globals.css」（skipped）と「Vercel Preview Comments」（success）だけ。コミットの status「Vercel」は **success（Deployment has completed）**。この head では失敗していない（デプロイ枠の切れによる失敗は、この SHA には出ていない）。
   代わりに私が b8f3d8d で LOCAL-CHECK を実施: `pnpm lint` は終了コード 0、`pnpm type-check` は終了コード 0、jsdom の全件（`vitest.config.ts`）は 112 ファイル・1118 件が通った。node と PDF の 2 本は今回の差分（`app/builder/*.tsx` と PNG だけ）と関係しないため走らせていない。`pnpm build` も走らせていない。must 1 の取り込み後に新しい head でやり直す必要がある。
4. 受け入れ基準: 下の「デザイン」のとおり、表の値・390px の縦積み・並び・フォーカス・36 枚・試験はそろっている。呼び出し側の試験が薄い点は want 2。
5. 明暗 × 1440/390: 36 枚とも 1440×900 または 390×844。12 枚を開いて見た。390 で横にはみ出しは無い。実画面かどうかは want 3。
6. 1 つの変更か: 部品・3 呼び出し・試験・証拠だけ。色には触っていない。`Closes #668` あり。
7. 本文と差分: want 1・4、nit 1 以外は一致（引数 3 つとその既定、3 呼び出しへの追加、フォーカスの説明、色は範囲外）。
8. 合成データ: 撮影の文言は「サンプル株式会社」「サンプル案件 A/B」「サンプル職務経歴書」「サンプルの時点」だけで、実データは無い。

### デザイン（ボードの CSS `.dlg` `.dlg-h` `.dlg-ic` `.dlg h2` `.dlg-b` `.dlg p` `.dlg-f` `.b` `.b.pri` `.b.dng` `.b.fv` `.rv.m …` と突き合わせた）
- 幅 `max-w-[480px]` と `w-[calc(100%-2rem)]`。撮影の画素でも 1440 で 480px、390 で 358px。
- 余白は `p-5 sm:p-6`（20/24）。中の間隔は `gap-2.5`（10）。フッターは `mt-2.5`（10）・`gap-2`（8）。ボードの `gap:10px` + `margin-top:10px` + `gap:8px` と同じ。
- 題名は `text-base font-bold leading-[1.6] pt-0.5`（ボードは 16/700/1.6/上 2px）。本文は `text-[13.5px] leading-[1.8]`、左は `sm:pl-11`（44px、撮影では本文の開始位置がダイアログの端から 68px = 24 + 44）。
- アイコンは `size-8 rounded-full`、見出しとの間は `gap-3`（12px、ボードの `.dlg-h gap:12px`）。
- ボタンは `h-11 sm:h-9`・`px-3`・`text-[13px] font-semibold`・`rounded-md`（`--radius-md` = 4px）。撮影の画素で 36 / 44px。
- 390 では `flex-col-reverse` と `w-full`（ボードの `.rv.m .dlg-f`）。
- 決定どおりかを呼び出し 10 箇所すべてで確かめた:

| 呼び出し | 並び（左→右） | 取消側 | アイコン | 初期フォーカス | 決定との一致 |
|---|---|---|---|---|---|
| builder-client.tsx:246 未保存のまま移動 | 危険 → 「編集に戻る」 | 主 | warn | 編集に戻る | 一致（ボードの fv も同じ） |
| builder-client.tsx:882 空のまま保存 | 「やめる」 → 危険 | 主 | warn | やめる | 一致 |
| builder-client.tsx:803 シート削除 | 「やめる」 → 危険 | 通常 | danger | やめる | 一致 |
| project-editor.tsx:396 案件削除 | 「やめる」 → 危険 | 通常 | danger | やめる | 一致 |
| project-nav.tsx:280 案件削除 | 「やめる」 → 危険 | 通常 | danger | やめる | 一致 |
| project-editor.tsx:412 会社と案件を削除 | 「やめる」 → 危険 | 通常 | danger | やめる | 一致 |
| builder-client.tsx:954 競合 | 「あとで」 → 主 | 通常 | warn（形は want 1） | あとで | 一致 |
| history-drawer.tsx:39 この時点に戻す | 取消 → 確認 | 通常 | danger（nit 2） | 取消 | 今のまま（一致） |
| builder-client.tsx:995 保存して履歴を開く | 取消 → 確認 | 通常 | info | 取消 | 今のまま（一致） |
| builder-client.tsx:1008 もう一度保存して開く | 取消 → 確認 | 通常 | info | 取消 | 今のまま（一致） |

- 色（主の暗い配色・危険色・オーバーレイ・影・warn-text）は決定どおり #671 の範囲として見ていない。390 で empty と削除系の危険が上に来るのは、決定どおり（ボードと同じ）なので指摘しない。

### 範囲
差分は `use-workspace-confirm.tsx`・`builder-client.tsx`（3 呼び出しに引数を足すだけ）・試験・PNG 36 枚。新しいグローバルトークンは無い。使ったトークン（`warn-soft` `warn-strong` `danger-soft` `accent-soft` `accent-text` `primary-dark`）は `app/globals.css` に既にある。範囲外の変更は無い。

### 試験
`use-workspace-confirm.test.tsx` と `use-pending-operation.test.tsx` を `--maxWorkers=1` で回して 12 件が通った。変更前の部品に戻すと新しい 4 件が落ち、元に戻した（`git checkout --`、作業ツリーはきれい）。ミューテーションの結果は want 2 のとおり。

### 本文と差分
want 1・4、nit 1 のとおり。実測の表（幅・余白・角丸・間隔・ボタン寸法）は、撮影の画素で数えた値と合っている。

### 証拠
36 枚がそろっていて、各ダイアログで明暗・1440/390 を少なくとも 1 枚ずつ開いた（discard light-1440・dark-390、empty light-390・dark-1440、sheet dark-390、project light-1440、company dark-1440・light-390、history light-1440、conflict light-390、savehist dark-1440、retry dark-390）。どれもボードどおりの並びとフォーカスの輪で、はみ出しは無い。

---
_Generated by [Claude Code](https://claude.ai/code)_

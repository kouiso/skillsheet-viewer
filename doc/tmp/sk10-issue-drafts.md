# #377 分割用 Issue 草案と #377 コメント案

このファイルはレビュー用の草案置き場です。まだ GitHub へは何も投稿していません。
承認後、Draft 1〜6 を `gh issue create -R kouiso/skillsheet-viewer --title "..." --body-file <path> --label devin` で起票し、Draft 7 を #377 にコメントとして投稿してください。

重複確認の結果:

- F（ダークテーマがリロードで消える）は #374 が既にあるので対象外。
- Draft 1（#377 の A / M4）は #390（2026-09-25 起票、`devin` ラベル付き）が同じ対象をすでにカバーしています。Draft 1 を起票する前に #390 と突き合わせて、不要なら飛ばしてください。
- 上記以外の 5 題（B・C・D・G・H）に対応する open Issue は `gh issue list --state all --limit 100` では見つかりませんでした。

## Draft 1

- title: `[SBI][modify] 案件カードの概要と担当業務を別欄にする (parent: #377)`
- label: `devin`

```markdown
## なぜ

#377 の A / M4。今は「概要（summary）が空なら担当業務（duties）を代わりに出す」という代用ルール。DB の 33 件は両方入っているので、担当業務の本文が 1 件も画面・PDF に出ていない。

## やり方

対象は 4 か所。#377 記載の file:line と一致することを main 26c777a で確認済み。

| 場所 | 直し方 |
|---|---|
| 閲覧カード（`src/component/block/project-card.tsx:74`） | 概要と担当業務を 2 つの欄に分ける |
| 検索の対象文字列（`src/component/block/project-section.tsx:62`） | 概要と担当業務の両方を検索対象に入れる |
| PDF の表示用データ（`src/component/pdf/print-view-model.ts:472`） | 概要と担当業務を別の値で持つ |
| PDF の欠落チェック（`src/component/pdf/print-completeness.node.ts:534`） | 両方の欄を検査する |

Excel 出力（`src/lib/export/build-xlsx.ts`）は両方を別の節で出しているので直さない。

案件カードの表示順は #377 の「1. 画面の構成」表どおり。空の欄は見出しごと出さない（今と同じ）。

## 完成の定義

- [ ] 案件カードに「概要」「担当業務」の 2 つの見出しが別々に出る
- [ ] 担当業務だけに出る語で検索すると、その案件が当たる
- [ ] PDF の表示データと欠落チェックの両方が、概要・担当業務を別の値で持つ
```

## Draft 2

- title: `[SBI][bug] 数字カードの参画プロジェクト数を案件カードの枚数から出す (parent: #377)`
- label: `devin`

```markdown
## なぜ

#377 の B。数字カードの「参画プロジェクト」は手で入れた値のままで、実際の案件カードの枚数と合っていない。架空データではカード 32 枚に対して 30 件と出た。

## やり方

表示されている案件の枚数から値を出す。手で入れた数字は使わない。対象は画面の数字カード・PDF・要約版の 3 面で、3 面が同じ数を出すようにする。

コード側の確認済みの補足。`src/db/derived-display.ts` の `resolveDisplayedStats` は既に 3 面（`src/component/block/stat-row.tsx`、`src/component/pdf/print-view-model.ts`、`src/db/block/serialize.ts`）で呼ばれている。ラベル集合 `PROJECT_COUNT_LABELS` に「参画プロジェクト」という表記が入っているか確認する。入っていなければ手入力の値がそのまま残る。

## 完成の定義

- [ ] 画面・PDF・要約版の 3 か所とも「参画プロジェクト」の数が、実際の案件カードの枚数と一致する
```

## Draft 3

- title: `[SBI][modify] 在籍期間外・開始終了逆転の案件をPDF欠落チェックで検出する (parent: #377)`
- label: `devin`

```markdown
## なぜ

#377 の C。会社の在籍期間の外にある案件や、開始が終了より後の案件があっても、今はどこにも出ない。画面は警告せず、会社内の年表バーは軸の外で空か灰色になるだけ。架空データで数えると、在籍の外に案件がある会社は 19 / 19 社、在籍の外の案件は 31 / 32 件、開始終了が逆の案件は 6 / 32 件。

## やり方

- 閲覧画面には警告を出さない。見るのは外の人だから（#377 の方針）
- PDF の欠落チェック（`src/component/pdf/print-completeness.node.ts`）に、在籍の外と開始終了の逆転の 2 検査を足す。どちらかがあるとビルドが通らないようにする
- repo 同梱の架空データ（`src/db/fixture/real-volume-demo.ts`、19 社 32 案件）を、案件が在籍期間に収まる形に直す
- 逆転を検出できるかの確認用に、開始と終了をわざと逆にした案件を 1 件だけ fixture として用意する

## 完成の定義

- [ ] 架空データの案件が在籍期間に収まっている（在籍の外 0 / 32）
- [ ] わざと逆にした 1 件を、欠落チェックが 1 / 1 で検出する
- [ ] 閲覧画面には警告を出していない
```

## Draft 4

- title: `[SBI][modify] 390pxヘッダーの1段化とデスクトップ出力ボタンのラベル (parent: #377)`
- label: `devin`

```markdown
## なぜ

#377 の D。390px 幅では表示切り替えの 5 ボタンが 2 段に折れ、ヘッダーが画面の 21 % を占め、会社見出しが 7px 隠れる。デスクトップでは出力ボタンが絵だけで、要約版がメニューだと分からない。

## やり方

390px のヘッダーを 1 段にする。収まらないときは横スクロールにする。高さは 120px 以下、会社見出しの隠れは 0px。

1280px の出力ボタン（ダウンロード・表・要約・テーマの 4 つ、`src/component/viewer-topbar.tsx`）に文字を付ける。今は単独のダウンロードに見えるアイコンをメニューにして、PDF・Excel・要約版を選べるようにする。メニューだと分かる見た目にする。

## 完成の定義

- [ ] 390px 幅でヘッダーの高さが 120px 以下
- [ ] 390px 幅で会社見出しがヘッダーに隠れない（0px）
- [ ] デスクトップの出力ボタンに文字が付き、要約版がメニューだと分かる
```

## Draft 5

- title: `[SBI][bug] 認証画面の送信ボタンを準備完了まで無効化する (parent: #377)`
- label: `devin`

```markdown
## なぜ

#377 の G。認証画面の読み込み直後に入力して送ると失敗することがある。サーバーの記録では 17 回中 2 回が 401。

「画面の準備前に送ると空のコードが飛ぶ」が疑わしいが、原因はまだ確かめていない。この対応は原因の確定ではなく、準備が終わるまで送れなくする防御的な修正とする。

## やり方

画面の初期化が終わるまで送信ボタンを無効にする。今は `app/viewer-auth/page.tsx:142` で送信中（`loginMutation.isPending`）しか無効化していない。準備完了前にコードを送れないようにする。

## 完成の定義

- [ ] 読み込み直後に入力して送る、を 20 回連続で試して失敗 0 回
```

## Draft 6

- title: `[SBI][modify] 出力3種の見出し語統一とPDFの概要重複の解消 (parent: #377)`
- label: `devin`

```markdown
## なぜ

#377 の H。3 つの出力で、同じ欄の見出しの言葉が違う（画面「担当業務」・PDF「業務内容」・Excel「要約」）。今は本文が実際に出るのは Excel だけだが、M4（#377 の A）で担当業務が 3 面とも出るようになると、見出しの差がそのまま残る。

PDF では、概要の同じ文が 1 案件で 2 回出る（サンプル PDF の 3〜5 ページで 6 件中 5 件）。

## やり方

- 3 面で見出しの言葉を 1 つに揃える。揃える語の決定は M4 の Issue（概要と担当業務の分離）と合わせる
- PDF で概要の文が 2 回出るのをやめる

## 完成の定義

- [ ] 画面・PDF・Excel で見出しの言葉が同じ
- [ ] PDF で概要の同じ文が 2 回出ない
```

## Draft 7

#377 へのコメント案（Issue 本文は編集せずコメントだけ）。

```markdown
完成の定義の「PDF で 1 件の途中にページの切れ目が無い」は現行コードと食い違っています。コードは 4 行以上の本文を、頭・尻とも 2 行以上残してページをまたぐ設計です。守っているのは、見出しと直後の内容が別ページに分かれないことだけです（print-paginate.ts / print-leaf-list.tsx）。

置き換え案です。「PDF で見出しと直後の内容が別ページに分かれない。本文が 4 行以上のときだけ、前後 2 行以上を残してページをまたいでよい」

採否はご判断ください。
```

裏付け（コードを読んで確認した箇所）:

- `src/component/pdf/print-paginate.ts:12` — 行で割れる葉は 4 行以上のときだけ、頭 2 行・尻 2 行以上で割る、と設計コメントに明記
- `src/component/pdf/print-paginate.ts:130-131` — `minLinesHead`・`minLinesTail` の既定がともに 2（widow / orphan を出さない、と `print-paginate.ts:44` に記載）
- `src/component/pdf/print-paginate.ts:67` — `canSplit` は行数が `minHead + minTail`（= 4）以上の葉だけ割る
- `src/component/pdf/print-paginate.ts:81-103` ・ `164-172` — `keepWithNext` の葉は次の葉と同居できなければ連鎖ごと次ページへ送る。連鎖が 1 ページを超えるときだけ尻から切る
- `src/component/pdf/print-leaf-list.tsx:103` — カード見出し（`ProjectCardHeader`）は `keepWithNext: true`
- `src/component/pdf/print-leaf-list.tsx:151` — 小見出し（`業務内容` などの `SectionLabel`）は `keepWithNext: true`
- `src/component/pdf/print-leaf-list.tsx:234` ・ `282` — 会社見出しと簡約表の列ヘッダーも `keepWithNext: true`
- `src/component/pdf/print-leaf-list.tsx:61` — 本文の markdown 断片（段落・箇条書き）は `text` と `remake` を持つため `splittable: 'lines'` になり、4 行以上ならページをまたげる
- `src/component/pdf/print-leaf-list.tsx:365-372` — またいだ次ページの先頭には継続見出し（会社名・案件名）を出す設計

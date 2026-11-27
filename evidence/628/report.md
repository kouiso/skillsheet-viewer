# #628 検証レポート（実アプリ http://127.0.0.1:3210 / main の本番ビルド / 隔離 DB）

検証シート: 628検証シート（id eb7cae47-5250-478e-833e-01233b3057cc）。案件ブロックは実ボリュームデモ（19社/32案件）、
数字カードだけ「種類なし・手入力値」の古い形で投入: エンジニア歴 99年 / 参画プロジェクト 99件 / 資格 5件。
（保存値 99 がそのまま出ず、案件から計算した値に差し替わるかを見るため）

## 値の突き合わせ（編集欄 = 閲覧画面）
| 項目 | 保存値 | 編集欄 | 閲覧画面 |
|---|---|---|---|
| エンジニア歴（年） | 99 | 8（読み取り専用）| 8年 |
| 参画プロジェクト（件）| 99 | 32（読み取り専用）| 32件 |
| 資格（件・自由）| 5 | 5（編集可）| 5件 |
明・暗 × 1440・390 の4通りすべて同じ（cap-result.json / mob-result.json）。板B「いまの実装」は 32件 = 案件カードの数、経験は [N]年 で、32件が一致。

## DoD
1. 種類があり、計算は種類で決まる: 満たす。src/db/derived-display.ts:33-38 `isStatComputed` / :112 `kind === 'experience'` は statKindOf(kind) で分岐。ラベルは種類が無い時の補い（:14-22, :26-28）だけに使う。実機: ラベルを「経験の長さ」に変えても種類=experience のまま（保存後に再読込しても experience / projectCount / free）。
2. 既存9語の項目が種類を補われ同じ値: 満たす。上記の古い形（種類なし）で 8 / 32 が出る（画面で確認）。単体: derived-display.test.ts の「種類が無い古い保存データは、これまでと同じ値で出る」「既存の9語のラベルから種類を補う」。保存時の補い: app/builder/serialize.ts:66,94、src/server/sheet-service-core.ts:447（編集前のラベルで補う）。本番既存データへの保存時補いは serialize 経由の保存で動く（今回の保存で kind が入ったことを再読込で確認）。
3. 編集欄で計算項目は数値欄が読み取り専用 +「案件から自動で出します」: 満たす。builder-*-1440/390.png。input readOnly=true を DOM で確認、注記は計算項目の数だけ表示（2件）。自由項目は編集可・注記なし。
4. ラベルを変えても自動計算が外れない: 満たす。動画 628-label-change-light-1440.webm。エンジニア歴→経験の長さ後も 8（ro）のまま、保存後の閲覧画面も「8年 経験の長さ」。video-after-label.png / video-saved.png（保存済み 13:35:40）/ video-viewer.png。
5. 明・暗 × 1440/390 のスクリーンショット: 撮影済み。builder-{light,dark}-{1440,390}.png、viewer-{light,dark}-{1440,390}.png（390 の編集欄は ☰アウトライン→統計を開いた状態。-390-full.png は全体）。値は上表のとおり一致。板 B との見比べは値（件数の根拠＝案件カード数）と見え方のみ。板 B は表示側のみで編集欄の板は無い。
6. 390px の横はみ出し: なし。builder / viewer とも明・暗で scrollWidth = clientWidth = 390（mob-result.json, cap-result.json）。fieldset 祖先にも溢れ無し。
7. lint / type-check / test / build: 今回は未実施（依頼外）。関係する単体のみ実行: node 設定 derived-display.test.ts 43/43 通過（test-node.txt）、jsdom 設定 stat-block-editor.test.tsx 19/19 通過（test-jsdom.txt）。

## 種類切替（#666）
UI に種類セレクト（計算（経験年数）/ 計算（案件数）/ 自由）あり。動画で 資格 を 自由→計算（案件数） に切替 → 値が 32（読み取り専用）・注記3件に、自由へ戻すと 5（編集可）に戻る（video-kind-switch.png）。戻した値 5 は保存値が保たれている。

## derived-display.ts:37 の単位条件について
`kind === 'experience' && isExperienceUnit(item.unit)`。単位が 年/ヶ月 以外の経験年数は計算せず手入力値を出す（#664 の規則、変更前と同じ挙動、単体テスト「単位が年・月以外なら手入力値を保つ」）。
「計算するかは種類で決まる（ラベルの文字の一致では決まらない）」とは矛盾しない: 条件に使うのは label ではなく kind と unit で、DoD が禁じるのはラベル文字による判断。ただし厳密には「種類だけ」では決まらず、経験年数は種類＋単位の2条件になる。この点は DoD 文言の読み方の問題で、UI では種類=計算（経験年数）かつ単位が年/ヶ月でない時に「単位を「年」か「ヶ月」にすると案件から計算します」が出る（stat-block-editor.tsx）ので、持ち主に理由が見える。懸念があるとすれば、種類を「計算」にしても単位次第で計算されない点が仕様として DoD に明記されていない事（PR 本文に書くと良い）。

## 気付き
- 暗モードの読み取り専用欄は背景 #1a2228 / 文字 #a3aeb4 の小さい文字（見た目はやや薄い。コントラスト計測は未実施）。
- 390px の編集欄は、削除（ゴミ箱）ボタンが各項目で単独の行に落ちる（はみ出しは無し）。
- 作業ツリーに他作業の変更あり（app/viewer-auth/page.tsx、e2e/.tmp-626-*）。自分のものではないので触っていない。e2e/.tmp-seed.ts と自作の seed は削除済み。

## 成果物（このディレクトリ）
builder-{light,dark}-{1440,390}.png / -390-full.png, viewer-*.png, mob-outline-*.png, video-*.png, 628-label-change-light-1440.webm, cap-result.json, mob-result.json, test-node.txt, test-jsdom.txt, cap.cjs / mob.cjs / vid.cjs

# スキルシートの画面・PDF品質検証と経歴文言の承認

## (Why?)なぜ、このタスクをやるのか？

### 現状

閲覧・編集・PDFで、表示対象の経歴を欠落なく読める状態にする。
Claudeがscratchの実ルートで認証し、before画像24枚を取得した。
Codexは画像・測定JSON・ソースを照合し、下記の修正案を作成した。
F-01〜F-04・F-07〜F-10はコード修正済み。
ClaudeがRound 3の自動採取を完了した。
Round 4の変更後の描画と全E2Eは未完了。
CodexによるDB変更、文言反映、Issue作成、コミットは行っていない。

基準SHAは `3843f14ff7cf3ad6073326a0b187697c815ccd12`。
ブランチは `codex/quality-final-20260921`。
対象シートは `18a79e66-75e2-47e8-922e-d61342bb5233`。
実ルート取得はClaude担当。Codexは取得済みの証跡を検証した。
対象のrevisionと生成基準月を揃えたDB・画面・PDF照合は残る。

証跡の基点は `.evidence/quality-final-20260921/`。
証跡パスはGit管理対象外のローカルファイルを指す。
実データ画像は非公開で扱い、公開用には合成データで再取得する。
マスク対象の文字列を含む測定記録は、Issueの指摘から除外する。

| 検査 | 結果と範囲 | 証跡 |
|---|---|---|
| 依存導入 | 固定lockfileで成功 | `install.log` |
| lint | 470ファイルと追加3検査成功。Round 1のアプリソース | `lint.log`、`lint.exit` |
| 型検査 | 1/1実行成功 | `type-check.log`、`type-check.exit` |
| 本番ビルド | 成功。Claudeも同SHAで再実行 | `build.log`、`build.exit`、`doc/adversarial-round-1-claude.md` |
| 画面単体 | 839/839件成功、90/90ファイル成功 | `test-baseline.log` |
| Node単体 | 617/626件成功、9件失敗。37/42ファイル成功 | `test-baseline.log`、`test-baseline.exit` |
| PDFテスト | 163/169件成功、6件スキップ。20/21ファイル成功 | `test-pdf.log`、`test-pdf.exit` |
| 全E2E | Round 1は58件中準備1件失敗、57件未実行 | `e2e-result.json`、`e2e.log` |
| Round 4変更テスト | 44/44件、3/3ファイル成功 | `round-4-unit.log`、`round-4-unit.exit` |
| Round 4関連画面テスト | 125/125件、11/11ファイル成功 | `round-4-affected-unit.log`、`round-4-affected-unit.exit` |
| Round 4採取計算 | 6/6件成功。ブラウザでは未実行 | `round-4-capture-test.log`、`round-4-capture-test.exit` |
| Round 4 lint・型検査 | 各1/1実行成功 | `round-4-lint.log`、`round-4-type-check.log`と各`.exit` |
| Round 3関連単体 | 79/79件、7/7ファイル成功。描画検証は別途必要 | `round-3-unit.log`、`round-3-unit.exit` |
| Round 3 lint・型検査 | 各1/1実行成功 | `round-3-lint.log`、`round-3-type-check.log`と各`.exit` |
| 採取計算のモック検査 | 5/5件成功。実画面の比率は未測定 | `round-3-capture-test.log`、`round-3-capture-test.exit` |
| 実ルートのbefore取得 | 6画面×2幅×2テーマ、24/24画像存在 | `before-auth-capture.json`、`before-auth-capture.log` |
| 合成PDF | A4縦41/41ページ、最小11pt | `pdf-measurement.json`、`synthetic-print.pdf` |

Claudeのログインと画像取得は、全E2E58件の完了を意味しない。
直接開いたプレビューで確認できたのは空状態まで。
閲覧者専用セッションの編集不可も、別途確認する。

### 最終形

- 1280pxと390px、明暗テーマで主要6画面を操作できる。
- モバイルでもバックアップと閲覧への移動を使える。
- 同名の目次項目を区別でき、目次ボタンが本文を隠さない。
- 通常文字4.5対1以上、大きな文字・操作部品3対1以上を満たす。
- faintとmutedの補助文字は各面で6対1以上とし、強弱を維持する。
- 画面の文字サイズは12px以上にする。PDFは11pt以上を維持する。
- タップ領域は44×44px以上を確認する。
- placeholder、focus、hover、エラー、選択状態も測定する。
- A4縦PDFは最小11ptとし、ページ数で情報を打ち切らない。
- 構造化ブロックとMarkdownが混在しても表示対象の情報を保持する。
- Next.js、API、保存形式を維持する。追加DDLは0。
- 経歴文言は、変更前後の全文を示して箇所ごとに承認を受ける。

## (How To ?) やり方の指定があるか？

### 画面別のbefore-after（スクショパス）

`{width}` は `1280` と `390`、`{theme}` は `light` と `dark`。
beforeとRound 3の自動afterは取得済み。Round 4のafterは未取得。
再採取のphaseは `round-4-after`。状態別の条件はRound 4回答に記載した。
以下の各ルートで4条件を揃える。基本画像は前後計48枚になる。

| 実ルート | 取得済みbefore | 再取得するafter | 追加状態 |
|---|---|---|---|
| `/login` | `before-login-{width}-{theme}.png` | `round-4-after-login-{width}-{theme}.png` | placeholder、Tab focus、認証エラー |
| `/viewer-auth` | `before-viewer-auth-{width}-{theme}.png` | `round-4-after-viewer-auth-{width}-{theme}.png` | 390px見出し、入力境界、Tab focus |
| `/builder` | `before-builder-{width}-{theme}.png` | `round-4-after-builder-{width}-{theme}.png` | モバイル操作群、プロフィール、推しチェック欄 |
| `/builder/preview` | `before-builder-preview-{width}-{theme}.png` | `round-4-after-builder-preview-{width}-{theme}.png` | 空状態と、編集画面から開いた同期中の別窓 |
| `/view` | `before-view-list-{width}-{theme}.png` | `round-4-after-view-list-{width}-{theme}.png` | カードの操作領域を文字列に依存せず測定 |
| `/view/db/[id]` | `before-sheet-{width}-{theme}.png` | `round-4-after-sheet-{width}-{theme}.png` | 自己紹介の折畳み・展開、会社一覧の開閉、目次、Tab focus |

### 測定結果と修正案

下表の行番号は基準SHAのソース位置。
F-01〜F-04・F-07〜F-10はRound 3で適用した。
Round 3ではbuilderの操作領域が全4条件で0/391個の不足となった。
F-07のリンク1件は残存し、Round 4で追加修正した。
比較値は既存のbefore測定から取得した。
全ページ画像上の背景採取には、非表示領域や固定要素の混入があった。
そのため、確定した操作領域と再測定が必要な色を区別する。

| ID | 発見・測定値 | 判定・修正案 | ソース位置 | after再取得 |
|---|---|---|---|---|
| F-01 | builderの小さい操作領域はPC53/391、390px53/389。明暗共通。53個とも推しチェック欄20×20px | チェック欄を44×44pxのlabelで包む。入力自体は20pxを維持し、label全域を押せるようにする | `app/builder/block-editor/skill-block-editor.tsx:96` | `/builder`、両幅・両テーマ。チェック欄のTab focusと領域 |
| F-02 | 390pxでバックアップと閲覧への移動が消える | 非表示指定を外し、モバイルでは見出し下の操作行へ配置。破棄確認・disabled条件を維持する | `app/builder/builder-client.tsx:925`、`:998`、`:1008` | `/builder`、両幅・両テーマ。390pxで両機能へ到達 |
| F-03 | CONTENTSに同名の「受託」が2件ある | 重複時だけ表示順の連番を添える。目次と読み上げ名で揃え、本文・保存値・移動先IDは維持する | `src/component/skill-sheet-viewer.tsx:303`、`src/component/table-of-contents.tsx:73` | `/view/db/[id]`、PCの目次と390pxの目次を開いた状態、両テーマ |
| F-04 | 390pxの固定目次ボタンが注記・経験年数・出典ラベルに重なる | 目次ボタンを専用の通常フロー行へ移す。本文末尾のpadding追加だけでは途中の重なりを解消できない | `src/component/table-of-contents.tsx:91` | `/view/db/[id]`、390px明暗。先頭・注記・末尾、目次開閉。PCも回帰確認 |
| F-07 | Round 3でもシートPCに453.21875×24pxのリンク1件が残存 | 案件カードのInlineMarkdown内、単独リンクのliに画面用44px領域を適用 | `src/component/inline-markdown.tsx`、`app/globals.css` | `/view/db/[id]`、両幅・両テーマ。案件カードの該当箇条書きとTab focus |
| F-08 | プレビュー空状態の復帰リンクがPC明暗で123×27px | 空状態自体は仕様どおり。復帰リンクにmin-height・min-width各44pxを指定する | `app/builder/preview/sync-bar.css:79`、`sync-bar.tsx:55` | `/builder/preview`、両幅・両テーマ。空状態とTab focus |
| F-09 | 一覧の行ボタンはPC686×40px、390px324×40px。明暗とも1/4個が44px未満 | `min-h-11` を追加。更新日のマスク文字列を使わず、操作部品の寸法で確認 | `app/view/db-sheet-list-client.tsx:85` | `/view`、両幅・両テーマ。行全体とTab focus |
| F-10 | 会社一覧のsummaryはPC936×32px、390px358×32px | `min-h-11` と上下12pxのpaddingを設定 | `src/component/block/company-jump-nav.tsx:51` | `/view/db/[id]`、両幅・両テーマ。開閉とTab focus |

画像で確認した根拠は以下のとおり。

- F-02：`crop-before-builder-390-light-0.png`。
F-03の根拠は `crop-before-sheet-1280-light-0.png` と `crop-before-sheet-1280-dark-0.png`。
- F-04：`crop-before-sheet-390-light-0.png`。注記への重なりは先頭側の画像で確認した。
スキル一覧の補助文字の根拠は `crop-before-sheet-390-light-1400.png` とダーク版。
- プレビュー空状態：`crop-before-builder-preview-1280-light-0.png`。
- 一覧の配置：`crop-before-view-list-1280-light-0.png`。

#### 指摘を採用しなかった項目

「表示するビュー」の2.10は `legend.sr-only` の測定だった。
非表示の補助要素なので、文字色変更の対象から除外する。
スクリーンリーダー向けの名前は維持する。

「案件算出／本人入力」は通常のspanとして描画される。
場所は `src/component/block/skill-matrix.tsx:82`。
Round 1の採取では最小値がライト7.56、ダーク7.25だった。
Round 2では目次ボタンが重なる位置で低い画素候補が出た。
この差はF-04の重なりとして扱い、ラベル自体の色は変えない。

F-05の自己紹介とF-06の会社一覧の色変更は取り下げた。
Claudeは採取矩形を拡大し、装飾記号の色が背景へ混入したと報告した。
会社リンク本体には、開いた状態でも低コントラストの候補がなかった。
自己紹介の `text-foreground/80` も維持する。
証跡は `round-2-before-auth-capture.json` と `round-2-before-summary.json`。
拡大画像の読取りは `doc/adversarial-round-2-claude.md` による。

旧一覧のマスク対象文字列を含む記録は、指摘から除外した。
F-09には、Round 2で文字列を含めず取得したボタン寸法を使う。

### 採取スクリプトの拡張と誤検出

Round 3に残った27件の画素最小値は、Claudeが採取矩形を確認した。
装飾や隣接要素を背景として扱った候補なので、画面の違反には数えない。
旧F-11は対象27件の除外数が全て0で、誤検出を解消できていなかった。

Round 4ではCSSの単色背景計算を一次値 `primaryContrast` とする。
画素の最小値と除外数は、目視確認用の参考値として保持する。
背景画像・透過効果で計算できない場合はnullとする。
この計算は重なりや欠けを検出しない。画像確認は別途必要。
10%のアクセント境界を含む合成矩形の回帰テストを追加した。

`capture-auth.mjs` に `--state` と `--width` を追加した。
目次開閉、案件タブ、会社リンクhover、実別窓の同期切れを採取する。
899pxと900pxでは目次の境界を確認する。
同期切れは編集元を別ページへ遷移させ、heartbeat停止後に取得する。
これは保存・競合のE2Eを完了したことを意味しない。

本文・入力値・リンクURLは測定JSONに記録しない。
認証後はcontext内のAPI書込みを遮断し、別窓にも適用する。
マスク対象と未測定箇所は合格扱いにしない。

### 2026-09-21の視認性要望への対応

以下はこのブランチでコードを変更済み。実画面のafterは未取得。
色比は `capture-state.mjs` のsRGB式と同じ関数で計算した。
実際の合成・重なり・半透明状態の測定値とは区別する。
計算証跡は `round-4-token-contrast.json`、生成処理は `measure-token.mjs`。

ライトの旧mutedはchip面で6未満のため、faintだけでは階層を保てない。
両テーマともmutedとfaintを別の色に調整した。
ライトのfaintはmutedより明るく、ダークではmutedより明度を抑える。
プロフィールのdtはfaint、出典ラベルのspanはmutedを使う。
「案件算出／本人入力」は疑似要素ではなく通常のspan。
両方の6対1条件を下表と回帰テストで確認した。

| ファイル・行 | テーマ・文字色 | 変更前 | 変更後 | 面 | 計算値（前 → 後） |
|---|---|---|---|---|---|
| `app/globals.css:77` | light / `--faint` | `#5f6a71` | `#424e55` | `--background` (#f6f8f8) | 5.2028 → 8.0328 |
| `app/globals.css:77` | light / `--faint` | `#5f6a71` | `#424e55` | `--card` (#ffffff) | 5.5458 → 8.5624 |
| `app/globals.css:77` | light / `--faint` | `#5f6a71` | `#424e55` | `--popover` (#ffffff) | 5.5458 → 8.5624 |
| `app/globals.css:77` | light / `--faint` | `#5f6a71` | `#424e55` | `--muted` (#f0f3f3) | 4.9700 → 7.6733 |
| `app/globals.css:77` | light / `--faint` | `#5f6a71` | `#424e55` | `--surface2` (#f0f3f3) | 4.9700 → 7.6733 |
| `app/globals.css:77` | light / `--faint` | `#5f6a71` | `#424e55` | `--surface3` (#e9eeee) | 4.7348 → 7.3103 |
| `app/globals.css:77` | light / `--faint` | `#5f6a71` | `#424e55` | `--accent` (#ecfaf8) | 5.1751 → 7.9901 |
| `app/globals.css:77` | light / `--faint` | `#5f6a71` | `#424e55` | `--accent-soft` (#ddf0ed) | 4.6905 → 7.2419 |
| `app/globals.css:77` | light / `--faint` | `#5f6a71` | `#424e55` | `--chip-bg` (#dde5e5) | 4.3346 → 6.6924 |
| `app/globals.css:77` | light / `--faint` | `#5f6a71` | `#424e55` | `--track` (#d5dede) | 4.0491 → 6.2516 |
| `app/globals.css:77` | light / `--faint` | `#5f6a71` | `#424e55` | `--danger-soft` (#fbf0ef) | 4.9681 → 7.6704 |
| `app/globals.css:77` | light / `--faint` | `#5f6a71` | `#424e55` | `--warn-soft` (#fdf6e6) | 5.1501 → 7.9514 |
| `app/globals.css:40` | light / `--muted-foreground` | `#4a565c` | `#34424a` | `--background` (#f6f8f8) | 7.0948 → 9.7328 |
| `app/globals.css:40` | light / `--muted-foreground` | `#4a565c` | `#34424a` | `--card` (#ffffff) | 7.5626 → 10.3746 |
| `app/globals.css:40` | light / `--muted-foreground` | `#4a565c` | `#34424a` | `--popover` (#ffffff) | 7.5626 → 10.3746 |
| `app/globals.css:40` | light / `--muted-foreground` | `#4a565c` | `#34424a` | `--muted` (#f0f3f3) | 6.7773 → 9.2973 |
| `app/globals.css:40` | light / `--muted-foreground` | `#4a565c` | `#34424a` | `--surface2` (#f0f3f3) | 6.7773 → 9.2973 |
| `app/globals.css:40` | light / `--muted-foreground` | `#4a565c` | `#34424a` | `--surface3` (#e9eeee) | 6.4567 → 8.8575 |
| `app/globals.css:40` | light / `--muted-foreground` | `#4a565c` | `#34424a` | `--accent` (#ecfaf8) | 7.0571 → 9.6811 |
| `app/globals.css:40` | light / `--muted-foreground` | `#4a565c` | `#34424a` | `--accent-soft` (#ddf0ed) | 6.3963 → 8.7746 |
| `app/globals.css:40` | light / `--muted-foreground` | `#4a565c` | `#34424a` | `--chip-bg` (#dde5e5) | 5.9109 → 8.1088 |
| `app/globals.css:40` | light / `--muted-foreground` | `#4a565c` | `#34424a` | `--track` (#d5dede) | 5.5216 → 7.5747 |
| `app/globals.css:40` | light / `--muted-foreground` | `#4a565c` | `#34424a` | `--danger-soft` (#fbf0ef) | 6.7747 → 9.2938 |
| `app/globals.css:40` | light / `--muted-foreground` | `#4a565c` | `#34424a` | `--warn-soft` (#fdf6e6) | 7.0229 → 9.6343 |
| `app/globals.css:142` | dark / `--faint` | `#858f97` | `#96a1a8` | `--background` (#0a0d0f) | 5.9155 → 7.3885 |
| `app/globals.css:142` | dark / `--faint` | `#858f97` | `#96a1a8` | `--card` (#0f1316) | 5.6648 → 7.0754 |
| `app/globals.css:142` | dark / `--faint` | `#858f97` | `#96a1a8` | `--popover` (#0f1316) | 5.6648 → 7.0754 |
| `app/globals.css:142` | dark / `--faint` | `#858f97` | `#96a1a8` | `--muted` (#141a1e) | 5.3276 → 6.6543 |
| `app/globals.css:142` | dark / `--faint` | `#858f97` | `#96a1a8` | `--surface2` (#141a1e) | 5.3276 → 6.6543 |
| `app/globals.css:142` | dark / `--faint` | `#858f97` | `#96a1a8` | `--surface3` (#182025) | 5.0097 → 6.2572 |
| `app/globals.css:142` | dark / `--faint` | `#858f97` | `#96a1a8` | `--accent` (#0c2320) | 4.9911 → 6.2340 |
| `app/globals.css:142` | dark / `--faint` | `#858f97` | `#96a1a8` | `--accent-soft` (#0c2320) | 4.9911 → 6.2340 |
| `app/globals.css:142` | dark / `--faint` | `#858f97` | `#96a1a8` | `--chip-bg` (#141b1f) | 5.2832 → 6.5988 |
| `app/globals.css:142` | dark / `--faint` | `#858f97` | `#96a1a8` | `--track` (#192227) | 4.9045 → 6.1258 |
| `app/globals.css:142` | dark / `--faint` | `#858f97` | `#96a1a8` | `--danger-soft` (#2a1715) | 5.1737 → 6.4621 |
| `app/globals.css:142` | dark / `--faint` | `#858f97` | `#96a1a8` | `--warn-soft` (#241d0d) | 5.0719 → 6.3348 |
| `app/globals.css:124` | dark / `--muted-foreground` | `#98a3aa` | `#aeb9bf` | `--background` (#0a0d0f) | 7.5688 → 9.7382 |
| `app/globals.css:124` | dark / `--muted-foreground` | `#98a3aa` | `#aeb9bf` | `--card` (#0f1316) | 7.2481 → 9.3255 |
| `app/globals.css:124` | dark / `--muted-foreground` | `#98a3aa` | `#aeb9bf` | `--popover` (#0f1316) | 7.2481 → 9.3255 |
| `app/globals.css:124` | dark / `--muted-foreground` | `#98a3aa` | `#aeb9bf` | `--muted` (#141a1e) | 6.8166 → 8.7704 |
| `app/globals.css:124` | dark / `--muted-foreground` | `#98a3aa` | `#aeb9bf` | `--surface2` (#141a1e) | 6.8166 → 8.7704 |
| `app/globals.css:124` | dark / `--muted-foreground` | `#98a3aa` | `#aeb9bf` | `--surface3` (#182025) | 6.4099 → 8.2471 |
| `app/globals.css:124` | dark / `--muted-foreground` | `#98a3aa` | `#aeb9bf` | `--accent` (#0c2320) | 6.3861 → 8.2165 |
| `app/globals.css:124` | dark / `--muted-foreground` | `#98a3aa` | `#aeb9bf` | `--accent-soft` (#0c2320) | 6.3861 → 8.2165 |
| `app/globals.css:124` | dark / `--muted-foreground` | `#98a3aa` | `#aeb9bf` | `--chip-bg` (#141b1f) | 6.7598 → 8.6973 |
| `app/globals.css:124` | dark / `--muted-foreground` | `#98a3aa` | `#aeb9bf` | `--track` (#192227) | 6.2753 → 8.0740 |
| `app/globals.css:124` | dark / `--muted-foreground` | `#98a3aa` | `#aeb9bf` | `--danger-soft` (#2a1715) | 6.6197 → 8.5171 |
| `app/globals.css:124` | dark / `--muted-foreground` | `#98a3aa` | `#aeb9bf` | `--warn-soft` (#241d0d) | 6.4894 → 8.3494 |

画面の11px・11.5px指定55箇所を12pxへ変更した。
静的検査の下限も12へ上げた。相対サイズのinline codeにも下限を付けた。
PDFの文字サイズ指定は変更していない。

| ファイル | 行 | 変更前 | 変更後 | 検査・色比 |
|---|---|---|---|---|
| `app/builder/builder-client.tsx` | 933 | `text-[11.5px]` | `text-[12px]` | 静的下限12px。色比は継承先に依存し、実描画は未測定 |
| `app/builder/builder-client.tsx` | 979 | `text-[11px]` | `text-[12px]` | 静的下限12px。色比は継承先に依存し、実描画は未測定 |
| `app/builder/editor.css` | 81、359、482、648、693、807、835 | `font-size: 11.5px` | `font-size: 12px` | 静的下限12px。色比は継承先に依存し、実描画は未測定 |
| `app/builder/editor.css` | 125、143、152、159、212、228、336、351、452、495、501、659、742、793、871、903、919、927、952、969、994、1007、1088、1147、1163、1198、1258、1276 | `font-size: 11px` | `font-size: 12px` | 静的下限12px。色比は継承先に依存し、実描画は未測定 |
| `app/builder/project-form.tsx` | 452 | `text-[11px]` | `text-[12px]` | 静的下限12px。色比は継承先に依存し、実描画は未測定 |
| `app/builder/preview/sync-bar.css` | 19、32 | `font-size: 11px` | `font-size: 12px` | 静的下限12px。色比は継承先に依存し、実描画は未測定 |
| `app/builder/preview/sync-bar.css` | 86 | `font-size: 11.5px` | `font-size: 12px` | 静的下限12px。色比は継承先に依存し、実描画は未測定 |
| `src/component/table-of-contents.tsx` | 141 | `text-[11px]` | `text-[12px]` | 静的下限12px。色比は継承先に依存し、実描画は未測定 |
| `src/component/block/company-section.tsx` | 97 | `text-[11px]` | `text-[12px]` | 静的下限12px。色比は継承先に依存し、実描画は未測定 |
| `src/component/block/skill-matrix.tsx` | 40 | `text-[11px]` | `text-[12px]` | 静的下限12px。色比は継承先に依存し、実描画は未測定 |
| `src/component/block/process-overview.tsx` | 33 | `text-[11.5px]` | `text-[12px]` | 静的下限12px。色比は継承先に依存し、実描画は未測定 |
| `src/component/block/process-overview.tsx` | 56 | `text-[11px]` | `text-[12px]` | 静的下限12px。色比は継承先に依存し、実描画は未測定 |
| `src/component/block/process-stepper.tsx` | 32 | `text-[11px]` | `text-[12px]` | 静的下限12px。色比は継承先に依存し、実描画は未測定 |
| `src/component/block/project-card.tsx` | 110 | `text-[11px]` | `text-[12px]` | 静的下限12px。色比は継承先に依存し、実描画は未測定 |
| `src/component/block/company-jump-nav.tsx` | 53、63、64 | `text-[11px]` | `text-[12px]` | 静的下限12px。色比は継承先に依存し、実描画は未測定 |
| `src/component/block/tech-filter.tsx` | 170、190、211 | `text-[11px]` | `text-[12px]` | 静的下限12px。色比は継承先に依存し、実描画は未測定 |
| `src/component/block/section-head.tsx` | 54 | `text-[11.5px]` | `text-[12px]` | 静的下限12px。色比は継承先に依存し、実描画は未測定 |
| `app/globals.css` | 359 | 画面でも `0.9em` | 画面のみ `max(12px, 0.9em)` | 相対サイズの下限を12pxに固定。印刷は従来どおり |

### PDFの実測

合成データの基準月は2026年9月（内部月キー `24320`）。
全41ページが `595.280029 × 841.890015 pt` のA4縦。
空白以外の14,210テキスト描画単位の最小サイズは11pt。
11pt未満は0/14,210個だった。

成果物は `synthetic-print.pdf` と `pdf-measurement.json`。
白黒画像は `pdf-page-01.png` ～ `pdf-page-41.png`。
一覧画像は `pdf-contact-1.png` ～ `pdf-contact-4.png`。
全ページの配置と、先頭ページの原寸をRound 1で確認した。
対象シートのPDFダウンロードと全文の完全性照合は未実施。

### DB変更設計（未実行）

確定スキーマ差分は0。追加・変更・削除する列はない。

```diff
# src/db/schema.ts
# drizzle/*.sql
# 変更なし。マイグレーションの追加・実行なし。
```

| 情報 | 現在の保存先 | 新規列を設けない理由 |
|---|---|---|
| プロフィール・要約・強み | `blocks.data` のprofileデータ | 既存の正本で保持できる |
| 案件本文・担当・会社注記 | `blocks.data` のprojectデータ | 既存フィールドで承認差分を表現できる |
| 年齢表示 | profileの `meta.age` | 自動計算は提案段階。元データを推測しない |
| 改行・見出し・目次の区別 | 表示モデル | 表示専用情報の重複保存を避ける |
| 更新競合 | `skill_sheets.revision` | 既存の版管理を利用する |

追加列0個のため、表示専用ではない新規列の説明対象も0個。
移行とバックフィルは不要。実行件数は0件。

Claudeのscratch確認では、アプリは `skillsheet_runtime` ロールを使う。
`skillsheet_private.*` のSECURITY DEFINER関数は実行ロールを限定する。
ownerは所属ロールの権限を自動継承せず、同じ接続先でも認可結果が異なる。
この違いは運用上の設計注記として残し、DDL変更は行わない。
Codexは今回、資格情報ファイルの内容もDBも読み取っていない。

#### 承認後の限定更新とロールバック

1. 対象ID・所有者・revision・全ブロックを非公開で固定する。
2. 1フィールド1行の全文差分と根拠ハッシュを承認記録に結び付ける。
3. block ID・案件ID・フィールドで特定し、所属と変更前値を確認する。
4. 未承認・不一致なら中止する。CASで版を再確認して一括更新する。
5. 途中失敗は全体を戻し、成功時は本文・順序・版を読戻す。
6. 成功済み再実行で重複更新しない。状態不明なら先に読戻す。
7. 復旧は今回の変更箇所だけを対象にする。後続更新があれば中止する。
8. 復旧差分も承認し、CAS後に読戻す。コードはデータと別に戻す。

案件本文には既存のnarrative proposalとCASを利用する設計。
プロフィールは案件本文用の許可フィールドに含まれない。
対応範囲を拡張する場合も同等の承認と競合確認を必要とする。
DDLがないため、スキーマのロールバックは不要。

### 文言変更の承認表

旧42項目の全文表を、このworktreeの一次資料から再構成できていない。
更新処理のコードはあるが、旧原稿と根拠資料の代用にはしない。
前稿の仮行W-01～W-07は削除した。変更案・承認済み項目は0件。
下表は空のまま保持し、実際の全文差分が揃った項目だけを追加する。

| 項目ID | block ID・対象ID・フィールド | 変更前の全文 | 変更案の全文 | 理由・一次資料 | 本人の個別承認 | 適用状態 |
|---|---|---|---|---|---|---|

各項目は本人の承認後にのみ適用する。包括承認や過去の訂正を転用しない。
指導人数や成果を推測して補わない。生年月日は記録しない。
先頭3案件を重点監査し、推薦案件自体は追加監査の対象から除外する。
それ以外の表示対象の本文も保持する。

## (Complete!) 完成の定義(箇条書き)

### 受け入れ条件

- [x] 基準アプリでlint・型検査・本番ビルドを通す。
- [x] 合成PDFの全ページ寸法と最小文字サイズを実測する。
- [x] Claudeが実ルート6画面×2幅×2テーマのbeforeを取得する。
- [x] F-01〜F-04・F-07〜F-10のコード修正を適用する。
- [ ] Round 4の一次値・補助文字6対1・12px下限を実画面で確認する。
- [ ] Round 4の24条件と追加状態、899／900pxの画像を取得する。
- [ ] 通常文字・placeholder・focus等の色と領域を実測する。
- [ ] プレビュー同期、保存競合、失敗復旧、二重送信、閲覧者認可を確認する。
- [ ] Linuxで残るNodeテスト9件を検証する。macOS用に検査を弱めない。
- [ ] PDFの6件スキップを分類し、必要な実データ検査を完了する。
- [ ] 指定scratchで全E2Eを完了する。
- [ ] 同一revision・基準月のDB・画面・PDFを照合する。
- [ ] 個別の文言差分と一次資料を揃え、承認表を補完する。
- [ ] Claudeとのレビューを2回連続で未解決指摘なしにする。
- [ ] 公開用の合成データ証跡を添付する。

本番反映・PR作成・マージ・デプロイは今回の実施対象外。

## (Else) その他共有事項

### 残課題

- アプリ修正後のafter画像、全E2E、対象シートPDFの検証が残る。
- 単色背景の一次値と元画像を照合し、未測定箇所と遮蔽を確認する。
- プレビュー同期・保存・競合のE2Eは未完了。
- 旧42項目の原文・一次資料がなく、承認表は未完成。
- Round 1の資格情報一覧取得は露出面の課題として残す。作業ファイルは削除済み。
- 以後1Passwordは使用しない。資格情報は指定envから実行時だけ利用する。
- 資格情報のコピー・印字・別ファイル保存を禁止する。
- リモートCI、デプロイ、本番との一致は未確認。

Node失敗は `apply-narrative.test.ts` 3件、`repair-proposal-file.test.ts` 3件。
`narrative-journal`、`period-repair-approval`、`prepare-period-repair` は各1件。
全て `script/` 配下で、macOSにない `/proc/self/fd` を参照して失敗した。

指定scratchは `claude-quality-final-20260921`。
ブランチIDは `br-still-recipe-aqo57pdy`、DBは `neondb`。
プロジェクトは `cool-boat-26004396`。
本番mainの `br-empty-forest-aqe1538i` には書き込まない。

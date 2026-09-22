# 品質検証 Round 4（2026-09-21）

## 結果

ClaudeのRound 3返信を全文読み、依頼6項目を順に対応した。
状態別採取、測定方法、残存リンク、色・文字サイズを修正した。
変更した単体テストは44/44件、関連画面は125/125件成功した。
採取計算のテストは6/6件、lint・型検査も成功した。
実画面のafterはClaudeの採取待ち。連続クリーン回数は0。

DB接続・DDL・1Password・ブラウザ起動・コミットは実行していない。
資格情報の読取り・コピー・出力と、経歴文言の変更も0件。
42項目の承認表は空のまま維持した。

## 1：状態別採取

`capture-auth.mjs` に `--state` のカンマ区切り指定を追加した。
`--width` は1280、390、899、900を受け付ける。
指定省略時は全状態、全4幅を対象にする。
899／900pxではsheetと目次開閉だけを撮影する。
プロフィール展開は390pxだけを対象にする。
状態フィルターは撮影対象を絞るもので、認証と経由ページの移動は実施する。
既存のphase JSONがあれば上書きせず終了する。

Claude側で変更後をビルドし、実行中のアプリを更新してから採取する。
例は以下。資格情報は既存tmp envから実行時だけ渡す。

```sh
node .evidence/quality-final-20260921/capture-auth.mjs round-4-after
```

絞込みの例。別phase名で保存し、全条件の証跡を上書きしない。

```sh
node .evidence/quality-final-20260921/capture-auth.mjs round-4-toc --state toc-open,toc-collapsed --width 899,900
```

| state | 実ルート | 幅 | テーマ | 操作と確認対象 |
|---|---|---|---|---|
| login | `/login` | 1280・390 | 明暗 | 空欄placeholder、Tab focus |
| viewer-auth | `/viewer-auth` | 1280・390 | 明暗 | 見出し・入力・Tab focus |
| builder | `/builder` | 1280・390 | 明暗 | プロフィール、推しチェック欄、操作群 |
| builder-project | `/builder` | 1280・390 | 明暗 | 案件エディタのボタンをクリックし、12px変更後の配置を取得 |
| builder-preview | `/builder/preview` | 1280・390 | 明暗 | 直接アクセスした空状態 |
| preview-stale | `/builder/preview` | 1280・390 | 明暗 | 実別窓を起動。元画面をviewへ移動し、heartbeat停止後のstaleを待つ |
| view-list | `/view` | 1280・390 | 明暗 | 一覧行の操作領域 |
| sheet | 対象シート | 1280・390・899・900 | 明暗 | 基本状態。補助文字と12px下限 |
| toc-open | 対象シート | 1280・390・899・900 | 明暗 | モバイルは目次ボタンで開く。PCは初期展開状態 |
| toc-collapsed | 対象シート | 1280・390・899・900 | 明暗 | PCは折畳みボタン。モバイルは開いてEscapeで閉じる |
| sheet-profile-expanded | 対象シート | 390 | 明暗 | 自己紹介を展開。dtラベルを確認 |
| sheet-company-open | 対象シート | 1280・390 | 明暗 | 会社一覧を開く |
| company-hover | 対象シート | 1280・390 | 明暗 | 開いた会社一覧の先頭リンクへhover |
| sheet-source-label | 対象シート | 1280・390 | 明暗 | 出典ラベル位置へスクロール |

対象シートは `/view/db/18a79e66-75e2-47e8-922e-d61342bb5233`。
別窓のviewportも指定幅・高さ900pxへ明示設定する。
状態間の再遷移で目次を初期化し、別状態の開閉を持ち越さない。
API書込み遮断をcontextへ移し、認証後の別窓にも適用した。
実行中の例外に含まれ得る入力値は出力しない。

## 2：測定方法の修正

既存のRound 3 JSONは34状態、低い画素候補は27件だった。
その27件の `excludedDecorationPixels` は全て0で、Claudeの指摘に同意する。
隣接要素や境界線まで色近似を広げる方法は採らず、一次値を変更した。

| 値 | 用途 |
|---|---|
| `primaryContrast` | CSSの単色背景と文字色から計算した一次値 |
| `primaryMethod` | `computed-flat-paint-only`、または未測定理由 |
| `flatPaint` | 色、背景、selector、計算状態 |
| `minimumContrast` | 装飾候補除外後の画素最小値。目視確認用 |
| `rawMinimumContrast` | 除外前の画素最小値。目視確認用 |
| `excludedDecorationPixels` | 除外した走査サンプル数。0もそのまま保存 |

画像背景やgroup opacityで単色計算できない場合はnullを残す。
nullを画素候補へ置き換えたり、合格に数えたりしない。
単色背景計算は重なりや隣接要素による遮蔽を検査しない。
Claudeが元画像と照合する必要がある。
旧画素候補の27件は、実画面の違反一覧から外した。

10%のアクセント境界を含む合成矩形の回帰テストを追加した。
除外数0でも、一次値が単色背景の計算値と一致することを検査する。
ログの低コントラスト件数も一次値で集計する。
faint・mutedと同じ不透明色のノードは6対1を下限にする。
それ以外は通常文字4.5、大きな文字3を維持する。
12px未満のノード数と未測定数も出力する。

## 3：453×24pxのリンク

Round 3 JSONのselectorは、案件カード内の `ul > li > a` を指していた。
末尾は `section:nth-of-type(13)…article…ul:nth-of-type(2)>li:nth-of-type(1)>a`。
目次や会社ジャンプではなく、`InlineMarkdown` が描画する単独リンクだった。
Round 3の修正は別のMarkdownコンポーネントだけを対象にしており、届いていなかった。

`InlineMarkdown` のliに、単独リンクの場合だけ `standalone-link` を付けた。
既存の画面用CSSを共有し、最小44pxと上下余白を適用する。
本文途中のリンクや、印刷表示には適用しない。
強調文字を含む単独リンクと、本文内リンクの分類テストを追加した。
採取JSONのtapTargetsにも本文を含まないselectorを追加した。
今回の実測寸法は未取得。

## 4：視認性の変更と計算結果

式は `capture-state.mjs` の `contrastRatio` を直接使用した。
sRGBの分岐点は0.04045、輝度係数は0.2126／0.7152／0.0722。
alphaを背景へ合成し、輝度の比に0.05を加える。
表の値は不透明な色トークンの計算結果。スクリーンショットでの実測は未実施。
JSONは丸め前の値を保存し、表だけ小数4桁に丸めた。

ライトの旧mutedはchip面で6未満だった。
faintをそれより薄く保ったまま6以上にすることはできない。
そのため、両テーマともmutedを強め、faintとの差を保った。
ライトのfaintはmutedより明るく、ダークではmutedより明度を抑えた。
補助文字の強弱を維持するという意味で、明暗で明度の方向を変えている。

プロフィールのdtは `profile-intro.tsx:92–105` のfaintを継承する。
「案件算出／本人入力」は `skill-matrix.tsx:82` のmutedを使用する。
このラベルは通常のspanとして描画される。
以下のfaint／mutedの表が、それぞれの色変更と各面での計算結果になる。

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

固定px指定は13ファイル55箇所を12pxへ変更した。
加えて画面用inline codeの相対指定にも12pxの下限を付けた。
各箇所の色は継承や状態によるため、未取得の実測比率は記載しない。
PDFのpt指定は変更していない。

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

`src/test/min-font-size.test.ts:6–7` の下限は11から12へ変更した。
`src/test/contrast.test.ts:22` のsRGB分岐点も採取式に揃えた。
同ファイル118–152行で、12面の6対1と色の階層を検査する。

## 5：Issue更新

画素候補27件を違反として扱わず、旧F-11が解決していなかったことを記載した。
色・サイズはこのブランチで適用済みとし、上記の変更前後の表を追加した。
残存リンクの場所と追加修正も更新した。
Linuxの9件、対象シートPDF、42項目、同期・保存・競合E2Eは未完了のまま。
1Passwordの残課題と `claude-quality-final-20260921` の指定も維持した。

## 6：変更ファイルと検査

フォント変更13ファイルの行は上の表に全て記載した。
以下は追加の変更ファイルと行範囲。過去Roundだけの差分は再掲しない。

| ファイル | 現在の行範囲 | 内容 |
|---|---|---|
| `app/globals.css` | 11–15、40、76–77、124、141–142、357–370 | 色、説明、画面用リンクとinline code |
| `src/component/inline-markdown.tsx` | 35、41–45 | 単独リストリンクの分類 |
| `src/component/inline-markdown.test.tsx` | 71–78 | 分類の回帰テスト |
| `src/test/contrast.test.ts` | 22、118–152 | 同一式と6対1の検査 |
| `src/test/min-font-size.test.ts` | 6–7 | 12px下限 |
| `.evidence/quality-final-20260921/capture-auth.mjs` | 1–205 | 採取・計算・検査、またはIssue更新 |
| `.evidence/quality-final-20260921/capture-state.mjs` | 1–166 | 採取・計算・検査、またはIssue更新 |
| `.evidence/quality-final-20260921/capture-state.test.mjs` | 1–76 | 採取・計算・検査、またはIssue更新 |
| `.evidence/quality-final-20260921/measure-token.mjs` | 1–22 | 採取・計算・検査、またはIssue更新 |
| `doc/quality-final-issue-draft.md` | 1–360 | 採取・計算・検査、またはIssue更新 |

本書 `doc/adversarial-round-4.md` も新規作成した。
証跡は `.evidence/quality-final-20260921/round-4-*` に保存した。
色のJSON・表、フォント変更一覧・表、検査ログ・終了コードが含まれる。
独立レビュー結果は `round-4-review.md`。未解決の確定指摘はなかった。
静的レビューと構文検査だけで、状態別スクリプトの動作成功とは扱わない。

### 変更したテスト

実行コマンド：

```sh
PATH=/Users/kouiso/.local/share/mise/installs/node/22.21.1/bin:/opt/homebrew/bin:/usr/bin:/bin /Users/kouiso/.local/share/mise/installs/node/22.21.1/bin/node /Users/kouiso/.cache/node/corepack/v1/pnpm/10.33.0/bin/pnpm.cjs vitest run src/test/min-font-size.test.ts src/test/contrast.test.ts src/component/inline-markdown.test.tsx
```

出力末尾（`round-4-unit.log`、終了コード0）：

```text

 ✓ src/test/contrast.test.ts (32 tests) 3ms
 ✓ src/test/min-font-size.test.ts (2 tests) 9ms
 ✓ src/component/inline-markdown.test.tsx (10 tests) 118ms

 Test Files  3 passed (3)
      Tests  44 passed (44)
   Start at  09:24:38
   Duration  1.14s (transform 63ms, setup 622ms, collect 238ms, tests 131ms, environment 1.16s, prepare 101ms)

```

### 採取計算のテスト

```sh
/Users/kouiso/.local/share/mise/installs/node/22.21.1/bin/node --test .evidence/quality-final-20260921/capture-state.test.mjs
```

`round-4-capture-test.log`、終了コード0：

```text
1..6
# tests 6
# suites 0
# pass 6
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 35.43575
```

### 関連画面のテスト

```sh
PATH=/Users/kouiso/.local/share/mise/installs/node/22.21.1/bin:/opt/homebrew/bin:/usr/bin:/bin /Users/kouiso/.local/share/mise/installs/node/22.21.1/bin/node /Users/kouiso/.cache/node/corepack/v1/pnpm/10.33.0/bin/pnpm.cjs vitest run app/builder/builder-client.test.tsx app/builder/project-form.test.tsx src/component/block/company-jump-nav.test.tsx src/component/block/company-section.test.tsx src/component/block/process-stepper.test.tsx src/component/block/project-card.test.tsx src/component/block/section-head.test.tsx src/component/block/skill-matrix.test.tsx src/component/block/tech-filter.test.tsx src/component/table-of-contents.test.tsx app/builder/preview/sync-bar.test.tsx
```

`round-4-affected-unit.log`、終了コード0：

```text

 Test Files  11 passed (11)
      Tests  125 passed (125)
   Start at  09:26:23
   Duration  4.96s (transform 902ms, setup 2.65s, collect 4.11s, tests 3.78s, environment 5.48s, prepare 789ms)

```

lintは470ファイルと追加ゲートが成功した。型検査も終了コード0。
コマンドは同じNode／pnpm指定の `pnpm lint` と `pnpm type-check`。
証跡は `round-4-lint.log`、`round-4-type-check.log` と各 `.exit`。
採取スクリプト2本の構文検査は `round-4-syntax.log`。

## 未検証事項

- Round 4の実画面、12px化後の折返し、横スクロール、タップ寸法。
- 新しい状態別採取、899／900px境界、実別窓の同期切れ。
- 単色背景では計算できない箇所、透過後の色、遮蔽、focusの見え方。
- 変更後の本番ビルド、全E2E、Linuxの9件、対象シートPDF。
- 42項目の全文差分と個別承認、保存・競合・同期のE2E。

## 次の一手

Claudeが `round-4-after` を実行し、JSONとbefore／after画像を照合する。
`primaryContrast` がnullの項目と画素候補は、元画像で確認する。
採取結果が揃ってから画面の合否を判定する。

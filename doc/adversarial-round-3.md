# 品質検証 Round 3（2026-09-21）

## 今回の結果

ClaudeのRound 2返信を全文読み、指定8件をコードへ適用した。
関連単体テスト79/79件、lint、型検査は成功した。
F-11・F-12の採取拡張と計算モック5/5件も完了した。
実画面のafterは未取得。クリーン回数は0のまま。

DB接続・DDL・1Password・ブラウザ起動・コミットは実行していない。
資格情報の読取り・コピー・出力も0件。
経歴本文の文言は変更せず、42項目の承認表は空のまま維持した。
F-03は合意済みの目次表示の連番だけを追加した。

## 変更ファイルと行範囲

行番号はこの回答時点のworktreeを指す。

| ファイル | 行 | 対応 |
|---|---|---|
| `app/builder/block-editor/skill-block-editor.tsx` | 97–105 | F-01。20px入力を44pxのlabelで包む |
| `app/builder/builder-client.tsx` | 925、1001、1008 | F-02。モバイルでは見出しと操作群を別行にし、隠れていた2操作を表示 |
| `src/component/table-of-contents.tsx` | 37–40、48–51、76、94–110 | F-03の連番と読み上げ名。F-04の通常フローの操作行 |
| `src/component/skill-sheet-viewer.tsx` | 121–132、373 | F-07の単独リンク判定。F-04の899px以下の縦配置 |
| `app/globals.css` | 368–376 | F-07。画面用の単独リンクに最小44pxと上下余白を設定 |
| `app/builder/preview/sync-bar.css` | 80–81 | F-08。復帰リンクと再接続ボタンに最小44px |
| `app/view/db-sheet-list-client.tsx` | 87 | F-09。行ボタンの最小高さ44px |
| `src/component/block/company-jump-nav.tsx` | 51 | F-10。summaryの最小高さ44pxと上下12pxの余白 |
| `app/builder/block-editor/skill-block-editor.test.tsx` | 17–20 | labelからのクリックで既存の変更処理が動くことを確認 |
| `src/component/table-of-contents.test.tsx` | 84–98 | 同名目次の区別と、折畳み後の移動先を確認 |
| `src/component/skill-sheet-viewer.test.tsx` | 361–373 | 強調・codeを含む単独リンクと本文内リンクの分類を確認 |
| `.evidence/quality-final-20260921/capture-auth.mjs` | 2、72–82、98–109 | 装飾色の取得とF-11の計算関数への接続 |
| `.evidence/quality-final-20260921/capture-state.mjs` | 41–64、122–151 | F-12の背景計算とF-11の画素除外 |
| `.evidence/quality-final-20260921/capture-state.test.mjs` | 全文 | 画素処理3件、明暗のplaceholder背景計算2件 |
| `doc/quality-final-issue-draft.md` | 1–266 | 適用済みの修正と未検証事項を更新 |
| `doc/adversarial-round-3.md` | 全文 | 本回答 |

保存・破棄確認・チェック変更・ジャンプ先の処理は維持した。
F-07は画面表示に限定し、印刷CSSには44pxの高さを適用しない。
独立レビューで、初案のinline-flexが装飾付きリンクに影響すると指摘された。
inline-blockへ修正し、再レビューでは未解決の指摘はなかった。
独立レビューは静的確認で、Claudeの描画確認は残る。

## F-11：装飾画素の除外

要素自身と子要素の文字色、装飾の背景色を取得する。
候補画素のRGB各成分が取得色から12以内なら除外する。
除外数をノード単位と画面単位の `excludedDecorationPixels` に保存する。
数える対象は走査したサンプルで、画像全体の面積は計測していない。
画面単位の値はノード別の合計なので、別ノード間の重複は含み得る。

補正前の値を `rawMinimumContrast`、補正後を `minimumContrast` とする。
候補が残らない場合はnullとし、低コントラスト件数へ入れない。
状態名は `decoration-filtered-pixel-candidate`。
全除外時は `unmeasured-no-background-samples`。

実際の背景も文字色に近い場合があるため、除外後の値だけで合格にしない。
透過した装飾やアンチエイリアスの色は除外しきれない場合がある。
生の値、除外数、元画像を合わせてClaudeが確認する。
実画面の除外数や新しい比率は、今回まだ取得していない。

## F-12：ログインplaceholder

旧処理は、祖先に背景画像やbackdrop-filterがあると計算を中断していた。
ログイン画面にはその両方があり、入力自身は不透明な `bg-background`。
不透明背景に到達したら、それより背後の背景は計算から外す。
祖先のgroup opacity・filterは子にも作用するので検査を続ける。
placeholder自体の背景色プロパティは、追加の背景塗りとして扱わない。

計算できた場合も状態名は `computed-flat-paint-only` のまま。
モックでは明暗ともこの分岐を確認した。
実ログイン4条件の数値が出ることは、Claudeの実行で確認が必要。

## after採取条件

phaseは `round-3-after`。
Claude側で修正後をビルドし、既存のscratch実行環境へ反映してから採取する。
採取スクリプトは `capture-auth.mjs round-3-after` として実行する。
資格情報は指定tmp envから実行時だけ渡し、出力やコピーはしない。
既存のbeforeファイルは保存する。

対象シートは `/view/db/18a79e66-75e2-47e8-922e-d61342bb5233`。
下表の「両幅」は1280pxと390px、「明暗」はlightとdark。
基本6画面の24条件も、`round-3-after-{screen}-{width}-{theme}.png` で揃える。

| ID | ルート | 幅 | テーマ | 状態・確認点 |
|---|---|---|---|---|
| F-01 | `/builder` | 両幅 | 明暗 | 推しチェック欄。20px入力と44px labelの寸法、Tab focus。採取中は値を変更しない |
| F-02 | `/builder` | 両幅 | 明暗 | プロフィールと案件タブ。バックアップ・閲覧・保存操作が画面内に収まること |
| F-03 | 対象シート | 両幅 | 明暗 | PC目次の展開・折畳み、モバイル目次を開く。同名2件のラベルと移動先 |
| F-04 | 対象シート | 両幅 | 明暗 | 先頭・スキル注記・経験年数と出典ラベル・末尾。目次を閉じた状態で本文に重ならないこと |
| F-05・F-06撤回確認 | 対象シート | 両幅 | 明暗 | 自己紹介の可視部分と展開、会社一覧を開く。装飾位置の元画像と除外前後の値 |
| F-07 | 対象シート | 両幅 | 明暗 | 単独リンクと前後の本文。長文・strong・codeを含むリンクは合成データで別途確認 |
| F-08 | `/builder/preview` | 両幅 | 明暗 | 直接開いた空状態とTab focus。同期切れの再接続ボタンも回帰確認 |
| F-09 | `/view` | 両幅 | 明暗 | 行ボタン全域とTab focus。更新日のマスク文字列を結果に使わない |
| F-10 | 対象シート | 両幅 | 明暗 | 会社一覧のsummaryを開閉、通常・hover・Tab focusの寸法とリング |
| F-11 | 対象シート | 両幅 | 明暗 | 自己紹介と節見出しの装飾位置。除外数・生の最小値・補正値・未測定数 |
| F-12 | `/login` | 両幅 | 明暗 | 未入力メール欄。placeholderのratio・status・背景色を確認 |

自動取得する追加stemは `sheet-profile-expanded`（390pxのみ）。
`sheet-company-open` と `sheet-source-label` も両幅で取得する。
focus画像は描画属性別の代表画像に限られる。
各Tab到達要素の測定値はJSONに残す。

目次の開閉、案件タブ、hover、同期切れはClaudeが別途操作して採取する。
追加画像名は `round-3-after-{state}-{width}-{theme}.png` とする。
stateは `toc-open`、`toc-collapsed`、`builder-project`、`company-hover`、`preview-stale`。
目次の899／900px境界も、明暗で配置が切り替わることを確認する。
保存やバックアップの実動作は、書込みを遮断する採取とは分けて検証する。

## Claudeの判定への回答

F-01〜F-04・F-07〜F-10の修正方針に同意し、適用した。
F-05・F-06の色変更撤回にも同意し、文字色と透過率は維持した。
出典ラベルは色そのものと目次の重なりを分け、F-04で修正した。
Round 2のJSONとsummaryを確認したが、新たな描画は見ていない。
装飾の拡大画像の判断はClaudeの報告に基づく。

F-09の幅はJSONでPC686px、390pxでは324pxだった。
Claudeの表の「両幅で686px」は訂正した。高さ40pxと修正方針は同じ。

以下の3点は、証跡から言える範囲を狭める必要がある。

- 書込み遮断0件が証明するのは、設定済みのAPI遮断に該当しなかったこと。
  認証前や別ページを含む、DB書込み全体が0件だった証明には使えない。
- sheetの非表示99件が一定でも、隠れた内容の状態別検証はできない。
  非表示範囲を除いた比較として扱う。99件全てが生年月日とは判定できない。
  マスクは年月日風の文字列全般に一致する実装になっている。
- focusVisibleとリングの存在だけでは、3対1や遮蔽の確認は完了しない。
  リングの色・太さ・隣接色・画像を確認してから合格にする。

根拠は `capture-auth.mjs` のマスクと認証後のAPI遮断処理、
`capture-state.mjs` のfocus採取と測定状態名。
今回の8件の修正方針は維持する。

## 検査コマンドと出力末尾

以下は実行したコマンド。終了コードと全文ログを証跡ディレクトリへ保存した。
PATH指定と直接起動は、未信頼のmise設定を変更せずに実行するため。

### lint

```sh
PATH=/Users/kouiso/.local/share/mise/installs/node/22.21.1/bin:/opt/homebrew/bin:/usr/bin:/bin /Users/kouiso/.local/share/mise/installs/node/22.21.1/bin/node /Users/kouiso/.cache/node/corepack/v1/pnpm/10.33.0/bin/pnpm.cjs lint > .evidence/quality-final-20260921/round-3-lint.log 2>&1
printf '%s\n' "$?" > .evidence/quality-final-20260921/round-3-lint.exit
tail -9 .evidence/quality-final-20260921/round-3-lint.log
```

終了コード `0`。出力末尾：

```text

> skillsheet-viewer@1.0.0 lint /Users/kouiso/ghq/kouiso/skillsheet-viewer/.worktrees/quality-final-20260921
> biome check . --error-on-warnings && node script/check-jsdom-pdf-assertion.mjs && node script/check-telemetry-import.mjs && ./script/check-naming.sh

Checked 470 files in 114ms. No fixes applied.
jsdom テストに PDF フォント・グリフ・描画の主張は見つかりませんでした。
カバレッジ外のテストファイルは見つかりませんでした。
telemetry import ゲート: 違反なし。
✅ 命名規約OK（英語・小文字・単数形・ケバブケース）
```

### type-check

```sh
PATH=/Users/kouiso/.local/share/mise/installs/node/22.21.1/bin:/opt/homebrew/bin:/usr/bin:/bin /Users/kouiso/.local/share/mise/installs/node/22.21.1/bin/node /Users/kouiso/.cache/node/corepack/v1/pnpm/10.33.0/bin/pnpm.cjs type-check > .evidence/quality-final-20260921/round-3-type-check.log 2>&1
printf '%s\n' "$?" > .evidence/quality-final-20260921/round-3-type-check.exit
tail -9 .evidence/quality-final-20260921/round-3-type-check.log
```

終了コード `0`。出力末尾：

```text

> skillsheet-viewer@1.0.0 type-check /Users/kouiso/ghq/kouiso/skillsheet-viewer/.worktrees/quality-final-20260921
> tsc --noEmit

```

### unit

```sh
PATH=/Users/kouiso/.local/share/mise/installs/node/22.21.1/bin:/opt/homebrew/bin:/usr/bin:/bin /Users/kouiso/.local/share/mise/installs/node/22.21.1/bin/node /Users/kouiso/.cache/node/corepack/v1/pnpm/10.33.0/bin/pnpm.cjs exec vitest run app/builder/block-editor/skill-block-editor.test.tsx app/builder/builder-client.test.tsx src/component/table-of-contents.test.tsx src/component/skill-sheet-viewer.test.tsx app/builder/preview/sync-bar.test.tsx app/view/db-sheet-list-client.test.tsx src/component/block/company-jump-nav.test.tsx > .evidence/quality-final-20260921/round-3-unit.log 2>&1
printf '%s\n' "$?" > .evidence/quality-final-20260921/round-3-unit.exit
tail -9 .evidence/quality-final-20260921/round-3-unit.log
```

終了コード `0`。出力末尾：

```text
 ✓ src/component/table-of-contents.test.tsx (7 tests) 247ms
 ✓ src/component/skill-sheet-viewer.test.tsx (14 tests) 231ms
 ✓ app/builder/builder-client.test.tsx (48 tests) 2422ms

 Test Files  7 passed (7)
      Tests  79 passed (79)
   Start at  08:51:35
   Duration  4.73s (transform 640ms, setup 1.15s, collect 2.96s, tests 3.25s, environment 2.33s, prepare 323ms)

```

### 採取計算のモック検査

```sh
/Users/kouiso/.local/share/mise/installs/node/22.21.1/bin/node --test .evidence/quality-final-20260921/capture-state.test.mjs > .evidence/quality-final-20260921/round-3-capture-test.log 2>&1
printf '%s\n' "$?" > .evidence/quality-final-20260921/round-3-capture-test.exit
```

終了コード `0`。出力末尾：

```text
1..5
# tests 5
# suites 0
# pass 5
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 32.957584
```

構文検査も `node --check` で2/2本成功した。
証跡は `round-3-syntax.log`。
差分の空白検査は `round-3-diff-check.log` に保存した。

## 未検証事項

- 修正後の画面、タップ領域、横スクロール、コントラスト。
- 実ログインplaceholderの4条件と、装飾画素の実除外数。
- プレビュー同期、保存・競合・失敗復旧、全E2E。
- 今回の変更後の本番ビルド、全単体テスト、Linuxの9件。
- 対象シートPDF、42項目の全文差分と個別承認。

既存のRound 1結果を、今回の修正後の全検査としては使わない。
Issue案はF-05・F-06の色修正を撤回し、F-04の重なりへ置き換えた。
F-09・F-10と今回の検査結果を追加した。
1Passwordの残課題、空の個別承認表、scratch名は維持した。
scratchは `claude-quality-final-20260921`。DDLは0。

## 次の一手

Claudeが `round-3-after` を採取し、元画像と測定値を返す。
未測定・重なり・操作領域を確認してから、次のクリーン判定へ進む。

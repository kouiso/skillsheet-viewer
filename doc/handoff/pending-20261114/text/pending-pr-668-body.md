## Issue リンク / Link to Issue

Closes #668

親 PBI は #626。この SBI は #626 を閉じる条件ではありません。

### 概要

ビルダーの確認ダイアログは全部、共有部品 `app/builder/use-workspace-confirm.tsx` で出しています。この部品の寸法・余白・文字・アイコン・390px の縦積み・ボタンの並びを、デザインボード（`.dlg` `.b` `.rv.m` と `solo-*`）に合わせました。分類は「このアプリへの機能要求」です。

- 色は触っていません（別の「色の SBI」で扱う）。主ボタンの暗い配色の地、危険色、オーバーレイと影の色は今のままです。新しいグローバルトークンも足していません。
- 暗い配色の warn-text がボード #f0cf73、アプリ `--warn-strong` #e0b53a で食い違う件は色の話なので、#671 で扱います。
- 部品に引数を 3 つ足しました（既定は今と同じ動き）: `icon`（`info` / `warn` / `danger` / `reload`。既定は danger なら `danger`、そうでなければ `info`）、`order`（`cancel-first` / `danger-first`）、`cancelVariant`（`default` / `primary`）。`reload` は注意色（warn）のまま、形をボードの競合ダイアログと同じ再読み込みの矢印にします（path はボードの `solo-conflict` からそのまま写した）。
- 呼び出し側の変更は `builder-client.tsx` の 3 呼び出しに引数を足しただけです（discard・empty・競合）。#667 が触る呼び出しは discard の `danger: true` の直後に 3 行足すので、重なる場合は行を並べて残してください。
- 最初のフォーカスは、全ダイアログで「安全側（取消側）のボタン」です。ボードの `fv` と一致します（discard と empty は主ボタン、削除系は「やめる」）。競合は指示どおり今のまま「あとで」です（Enter 1 回で下書きを捨てる側に置かない）。
- ボードに無いダイアログ（この時点に戻す・保存して履歴を開く・もう一度保存して開く）は今のままです。「この時点に戻す」は `danger: true` なので既定でゴミ箱のアイコンになります（戻すのは削除ではないので形は少しずれる）。ボードに無いものは触らない決定なので、アイコンも並びもフォーカスも変えていません。

### 呼び出し元の全件（10 呼び出し）

| ダイアログ | 呼び出し元 | ボード | 左 → 右 | 取消側の見た目 | 見出しアイコン | 初期フォーカス |
|---|---|---|---|---|---|---|
| 変更を捨てて移動 | builder-client.tsx | `solo-discard` | 危険 → 主「編集に戻る」 | 主 | warn | 編集に戻る |
| 空のまま保存 | builder-client.tsx | `solo-empty` | 主「やめる」 → 危険 | 主 | warn | やめる |
| シート削除 | builder-client.tsx | `solo-del-sheet` | 「やめる」 → 危険 | 通常 | danger | やめる |
| 案件削除（2 か所） | project-editor.tsx / project-nav.tsx | `solo-del-pj` | 「やめる」 → 危険 | 通常 | danger | やめる |
| 会社と案件を削除 | project-editor.tsx | `solo-del-co` | 「やめる」 → 危険 | 通常 | danger | やめる |
| 競合（最新を読み込む） | builder-client.tsx | `solo-conflict` | 「あとで」 → 主 | 通常 | reload（再読み込みの矢印・注意色） | あとで（今のまま） |
| この時点に戻す | history-drawer.tsx | ボードに無いので今のまま | 取消 → 確認 | 通常 | danger | 取消（今のまま） |
| 保存して履歴を開く | builder-client.tsx | ボードに無いので今のまま | 取消 → 確認 | 通常 | info | 取消（今のまま） |
| もう一度保存して開く | builder-client.tsx | ボードに無いので今のまま | 取消 → 確認 | 通常 | info | 取消（今のまま） |

呼び出しは全部で 10 か所です（builder-client 6・project-editor 2・project-nav 1・history-drawer 1）。表は案件削除の 2 か所を 1 行にまとめているので 9 行です。「新しいシートを作る」（`solo-create`）は、この部品を使う呼び出し元がまだ無いので対象外です。

### ボードと実装の比較（実測、2026-11-14、Chromium・deviceScaleFactor 1。実画面の 6 種 × 明暗 × 1440 / 390 の 24 枚すべてで同値。会社・案件は 2 件の場合。長い一覧は下の「長い一覧」で別に確かめた）

| 項目 | ボード | 実測 1440px | 実測 390px | 結果 |
|---|---|---|---|---|
| ダイアログ幅 | 最大 480px。390px は余白 16px で 358px | 480px | 358px | 一致 |
| 内側の余白 | 24px（390px は 20px） | 24px | 20px | 一致 |
| 角丸 | 8px | 8px | 8px | 一致 |
| 中の間隔 | 10px | 10px | 10px | 一致 |
| 本文の左 | 44px（390px は 0） | 44px | 0 | 一致（枠線 1px を除いた値） |
| 題名 | 16px・太さ 700・行高 1.6 | 16px・700・25.6px | 同左 | 一致 |
| 本文 | 13.5px・行高 1.8 | 13.5px・24.3px | 同左 | 一致 |
| ボタン高さ | 36px（390px は 44px） | 36px | 44px | 一致 |
| ボタン横余白・文字・角丸 | 12px・13px・太さ 600・4px | 12px・13px・600・4px | 同左 | 一致 |
| 390px のボタン | 縦並び・幅いっぱい（`column-reverse`） | 横並び | 幅 316px（ダイアログ内側いっぱい） | 一致 |
| 横はみ出し | なし | なし | なし（`scrollWidth` が `innerWidth` 以下） | 一致 |
| 縦（案件が多いとき） | ボードに無い | 一覧がスクロール・footer は画面内 | 同左 | 下の「長い一覧」 |
| 見出しのアイコンの大きさ | 32px の丸（warn / dng / 通常） | 32px の丸 | 同左 | 一致（色はアプリ既存トークン） |
| 競合の見出しアイコンの形 | 再読み込みの矢印（`M13 3v3.5H9.5` / `M12.6 6.4A5 5 0 1 0 13 9`） | 同じ path（注意色） | 同左 | 一致（実画面の撮影で確認） |
| 初期フォーカス | 安全側（ボードの `fv`） | 6 種すべて取消側 | 同左 | 一致（実測の `activeElement`） |
| 主ボタン暗い配色の地 | #14b8a6 | #0d9488 のまま | 同左 | 未対応（色の SBI） |
| 危険色 | #b64437 / #e9695c | #dc2626 / #ef4444 のまま | 同左 | 未対応（色の SBI） |
| オーバーレイと影 | `rgba(16,23,26,.45)` と専用の影 | `bg-black/50`・`shadow-xl` のまま | 同左 | 未対応（色の SBI） |
| 見出しの warn アイコン（暗い配色） | 文字 #f0cf73 | #e0b53a | 同左 | 未対応（#671） |
| ボタン内のアイコン（最新を読み込む・削除） | あり | なし | なし | 未対応（この SBI の範囲外。必要なら別 SBI） |

390px の縦積みは、ボードの CSS（`.rv.m .dlg-f` の `column-reverse`）をそのまま写しています。ボードの DOM 順のまま逆順に積むので、主ボタンが上に来るのは discard だけです。empty と削除系は、DOM 順が「やめる → 危険」なので、危険が上・「やめる」が下になります。これもボードどおりです。

390px の判定は、ボードの `.rv.m` に合わせて Tailwind の `sm`（640px）未満としています。

### 撮影証拠（`doc/confirm-dialog-evidence/`、合成データのみ）

#### 実画面（6 種 × 明・暗 × 1440px・390px の 24 枚）

本番ビルド（`pnpm build` → `next start`）の実際の `/builder` 画面を、このブランチの head で撮りました。DB は使い捨ての隔離 DB（`script/e2e-isolated-db.sh`）、データは合成（「サンプル株式会社」「サンプル案件 A/B」「サンプル職務経歴書」）、暗い配色は `theme-mode` の localStorage で切り替え、deviceScaleFactor は 1、画面は 1440×900 と 390×844 です。ダイアログは、実際の操作で開いています。

- 未保存のまま移動: 本文を書き換え、シート切替から「新しいシートを作る…」。保存要求は保留にして未保存のままにしている（このため背景に「保存中…」が出ている画面がある）
- 空のまま保存: 1 ブロックだけのシートの本文を空にして「保存」
- 競合: 同じシートを別画面で書き換えて自動保存させ、版を進めてから、こちらで「保存」（本物の競合。応答の差し替えはしていない）
- シート削除: シート切替の一覧から削除
- 案件削除: 案件の編集画面の「案件を削除」
- 会社と案件を削除: アウトラインの会社の削除

| ダイアログ | 呼び出し元 | 撮影 | 明/1440 ・ 明/390 ・ 暗/1440 ・ 暗/390 |
|---|---|---|---|
| 変更を捨てて移動（未保存のまま移動） | builder-client.tsx | 実画面 | [light/1440](https://github.com/kouiso/skillsheet-viewer/blob/e42bbfe/doc/confirm-dialog-evidence/confirm-discard-light-1440.png?raw=true) ・ [light/390](https://github.com/kouiso/skillsheet-viewer/blob/e42bbfe/doc/confirm-dialog-evidence/confirm-discard-light-390.png?raw=true) ・ [dark/1440](https://github.com/kouiso/skillsheet-viewer/blob/e42bbfe/doc/confirm-dialog-evidence/confirm-discard-dark-1440.png?raw=true) ・ [dark/390](https://github.com/kouiso/skillsheet-viewer/blob/e42bbfe/doc/confirm-dialog-evidence/confirm-discard-dark-390.png?raw=true) |
| 空のまま保存 | builder-client.tsx | 実画面 | [light/1440](https://github.com/kouiso/skillsheet-viewer/blob/e42bbfe/doc/confirm-dialog-evidence/confirm-empty-light-1440.png?raw=true) ・ [light/390](https://github.com/kouiso/skillsheet-viewer/blob/e42bbfe/doc/confirm-dialog-evidence/confirm-empty-light-390.png?raw=true) ・ [dark/1440](https://github.com/kouiso/skillsheet-viewer/blob/e42bbfe/doc/confirm-dialog-evidence/confirm-empty-dark-1440.png?raw=true) ・ [dark/390](https://github.com/kouiso/skillsheet-viewer/blob/e42bbfe/doc/confirm-dialog-evidence/confirm-empty-dark-390.png?raw=true) |
| 競合（最新を読み込む／あとで） | builder-client.tsx | 実画面 | [light/1440](https://github.com/kouiso/skillsheet-viewer/blob/e42bbfe/doc/confirm-dialog-evidence/confirm-conflict-light-1440.png?raw=true) ・ [light/390](https://github.com/kouiso/skillsheet-viewer/blob/e42bbfe/doc/confirm-dialog-evidence/confirm-conflict-light-390.png?raw=true) ・ [dark/1440](https://github.com/kouiso/skillsheet-viewer/blob/e42bbfe/doc/confirm-dialog-evidence/confirm-conflict-dark-1440.png?raw=true) ・ [dark/390](https://github.com/kouiso/skillsheet-viewer/blob/e42bbfe/doc/confirm-dialog-evidence/confirm-conflict-dark-390.png?raw=true) |
| シート削除 | builder-client.tsx | 実画面 | [light/1440](https://github.com/kouiso/skillsheet-viewer/blob/e42bbfe/doc/confirm-dialog-evidence/confirm-sheet-light-1440.png?raw=true) ・ [light/390](https://github.com/kouiso/skillsheet-viewer/blob/e42bbfe/doc/confirm-dialog-evidence/confirm-sheet-light-390.png?raw=true) ・ [dark/1440](https://github.com/kouiso/skillsheet-viewer/blob/e42bbfe/doc/confirm-dialog-evidence/confirm-sheet-dark-1440.png?raw=true) ・ [dark/390](https://github.com/kouiso/skillsheet-viewer/blob/e42bbfe/doc/confirm-dialog-evidence/confirm-sheet-dark-390.png?raw=true) |
| 案件削除 | project-editor.tsx / project-nav.tsx | 実画面 | [light/1440](https://github.com/kouiso/skillsheet-viewer/blob/e42bbfe/doc/confirm-dialog-evidence/confirm-project-light-1440.png?raw=true) ・ [light/390](https://github.com/kouiso/skillsheet-viewer/blob/e42bbfe/doc/confirm-dialog-evidence/confirm-project-light-390.png?raw=true) ・ [dark/1440](https://github.com/kouiso/skillsheet-viewer/blob/e42bbfe/doc/confirm-dialog-evidence/confirm-project-dark-1440.png?raw=true) ・ [dark/390](https://github.com/kouiso/skillsheet-viewer/blob/e42bbfe/doc/confirm-dialog-evidence/confirm-project-dark-390.png?raw=true) |
| 会社と案件を削除 | project-editor.tsx | 実画面 | [light/1440](https://github.com/kouiso/skillsheet-viewer/blob/e42bbfe/doc/confirm-dialog-evidence/confirm-company-light-1440.png?raw=true) ・ [light/390](https://github.com/kouiso/skillsheet-viewer/blob/e42bbfe/doc/confirm-dialog-evidence/confirm-company-light-390.png?raw=true) ・ [dark/1440](https://github.com/kouiso/skillsheet-viewer/blob/e42bbfe/doc/confirm-dialog-evidence/confirm-company-dark-1440.png?raw=true) ・ [dark/390](https://github.com/kouiso/skillsheet-viewer/blob/e42bbfe/doc/confirm-dialog-evidence/confirm-company-dark-390.png?raw=true) |

#### 長い一覧（案件 25 件の会社の削除、実画面 4 枚）

確認ダイアログの `details`（案件の一覧）が長いとき、一覧だけがスクロールし、題名とボタンが画面の外へ出ないことを確かめました。案件 25 件の会社で「会社と案件を削除」を、同じ手順（本番ビルド・隔離 DB・合成データ）で撮っています。`details` を包む要素に `min-h-0` が無いと、案件の多い会社でボタンが画面の外に出ていた（再レビューの指摘）ので足しました。

| 画面 | 画面の高さ | ダイアログの上下 | 題名の上端 | footer の下端 | 一覧の高さ（見える / 全体） | スクロール |
|---|---|---|---|---|---|---|
| 1440×900（明・暗） | 900 | 45 〜 855 | 70 | 830 | 603 / 692 | する |
| 390×844（明・暗） | 844 | 42 〜 802 | 63 | 781 | 456 / 692 | する |

画像: [light/1440](https://github.com/kouiso/skillsheet-viewer/blob/e42bbfe/doc/confirm-dialog-evidence/confirm-company-long-light-1440.png?raw=true) ・ [light/390](https://github.com/kouiso/skillsheet-viewer/blob/e42bbfe/doc/confirm-dialog-evidence/confirm-company-long-light-390.png?raw=true) ・ [dark/1440](https://github.com/kouiso/skillsheet-viewer/blob/e42bbfe/doc/confirm-dialog-evidence/confirm-company-long-dark-1440.png?raw=true) ・ [dark/390](https://github.com/kouiso/skillsheet-viewer/blob/e42bbfe/doc/confirm-dialog-evidence/confirm-company-long-dark-390.png?raw=true)

#### 部品単体の撮影（3 種。ビルダー画面上ではない）

次の 3 枚組は、前回の撮影（実際の部品と `globals.css` を使い捨てページに載せたもの）のままです。ボードにあって今回の対象になっている 6 種は上の実画面で撮り直しました。この 3 種はボードに無く、見た目を変えていないので撮り直していません。ビルダー画面上の撮影ではない点に注意してください。

| ダイアログ | 呼び出し元 | 撮影 | 明/1440 ・ 明/390 ・ 暗/1440 ・ 暗/390 |
|---|---|---|---|
| この時点に戻す | history-drawer.tsx | 部品単体 | [light/1440](https://github.com/kouiso/skillsheet-viewer/blob/e42bbfe/doc/confirm-dialog-evidence/confirm-history-light-1440.png?raw=true) ・ [light/390](https://github.com/kouiso/skillsheet-viewer/blob/e42bbfe/doc/confirm-dialog-evidence/confirm-history-light-390.png?raw=true) ・ [dark/1440](https://github.com/kouiso/skillsheet-viewer/blob/e42bbfe/doc/confirm-dialog-evidence/confirm-history-dark-1440.png?raw=true) ・ [dark/390](https://github.com/kouiso/skillsheet-viewer/blob/e42bbfe/doc/confirm-dialog-evidence/confirm-history-dark-390.png?raw=true) |
| 保存して履歴を開く | builder-client.tsx | 部品単体 | [light/1440](https://github.com/kouiso/skillsheet-viewer/blob/e42bbfe/doc/confirm-dialog-evidence/confirm-savehist-light-1440.png?raw=true) ・ [light/390](https://github.com/kouiso/skillsheet-viewer/blob/e42bbfe/doc/confirm-dialog-evidence/confirm-savehist-light-390.png?raw=true) ・ [dark/1440](https://github.com/kouiso/skillsheet-viewer/blob/e42bbfe/doc/confirm-dialog-evidence/confirm-savehist-dark-1440.png?raw=true) ・ [dark/390](https://github.com/kouiso/skillsheet-viewer/blob/e42bbfe/doc/confirm-dialog-evidence/confirm-savehist-dark-390.png?raw=true) |
| もう一度保存して開く | builder-client.tsx | 部品単体 | [light/1440](https://github.com/kouiso/skillsheet-viewer/blob/e42bbfe/doc/confirm-dialog-evidence/confirm-retry-light-1440.png?raw=true) ・ [light/390](https://github.com/kouiso/skillsheet-viewer/blob/e42bbfe/doc/confirm-dialog-evidence/confirm-retry-light-390.png?raw=true) ・ [dark/1440](https://github.com/kouiso/skillsheet-viewer/blob/e42bbfe/doc/confirm-dialog-evidence/confirm-retry-dark-1440.png?raw=true) ・ [dark/390](https://github.com/kouiso/skillsheet-viewer/blob/e42bbfe/doc/confirm-dialog-evidence/confirm-retry-dark-390.png?raw=true) |

### 見て欲しいポイント

- [ ] 破壊的ダイアログの並びが 3 通り（discard は危険が左、empty と削除系は危険が右）なのは、ボードがそうなっているから（#668 の本文も同じ記述に直し済み）
- [ ] `order` / `cancelVariant` / `icon` の 3 引数で、ボードの 3 通りを呼び出し側から選べること

### 見なくてもよいポイント

- [ ] 色（主ボタンの暗い配色、危険色、オーバーレイ、影、暗い配色の warn-text）は別 SBI と #671

### 試験

- 追加（部品）: `app/builder/use-workspace-confirm.test.tsx` に 4 件。既定の並びとフォーカス、`danger-first` の並びと取消側が主ボタンであること、`info` アイコン、390px の縦積み（`flex-col-reverse`・全幅・高さ 44px・`sm:` で 36px 横並び）と幅 480px・余白のクラス
- 追加（部品・長い一覧）: `details` を包む要素が `min-h-0` と `overflow-y-auto` を持つことを class で確かめる 1 件（jsdom は高さを計算しないので class までの確認。`min-h-0` を外すと落ちる。高さそのものは上の実画面の数値で確かめた）
- 追加（呼び出し側）: `app/builder/builder-client.test.tsx` に 3 件（未保存のまま移動・空のまま保存・競合）。実際の操作でダイアログを開き、ボタンの並び・取消側の見た目（主か通常か）・初期フォーカス・アイコンの種類を確かめる。呼び出しの引数を 1 種類ずつ外して確かめた: `order` を外すと discard が落ちる、`cancelVariant` を外すと discard と empty が落ちる、`icon` を外すと 3 件とも落ちる。3 種を全部外しても 3 件とも落ちる
- 検証の結果は、最終 head `e42bbfe` で次のとおり（時刻は下の LOCAL-CHECK）。`pnpm lint`・`pnpm type-check`・`pnpm build`・`./script/check-naming.sh` は通過。`pnpm test` は jsdom 1127 件・node 1202 件（1 件 skip）・PDF 229 件（7 件 skip）が通過。1 回目の通しは、ほかの作業で負荷が高い間（load average 約 21）に、既存の `builder-client.test.tsx` の 2 件（履歴前の保存確認の取消／履歴前の CAS 保存応答）が約 6 秒で時間切れになり落ちた（jsdom 1125 件通過・2 件失敗）。そのファイルを単独（`--maxWorkers=1`）で回すと 60 件すべて通り、その後の通しも全部通った。変更前から同じ条件で揺れる試験で、今回の差分とは関係しないと見ている（負荷が原因という点は未確認）
- 途中で `pnpm build` が一度失敗した。作業場に残っていた `.next/dev` の型定義が、以前の使い捨ての検証ページ（コミットしていない）を参照していたため。`.next` を消して作り直すと通った。コードの問題ではない

### PR チェックポイント

- [x] タイトルに チケット番号が入っているか
- [x] 複数の変更が 1 つの PR に入り込んでいないか（色は含めていない）
- [x] 開発環境修正はなし
- [x] Admin / Owner の対はなし

### レビュー観点

- [ ] 想定通りに動作するか
- [ ] より良い書き方はないか？
- [ ] より良い設計はないか？
- [ ] 他の部分と書き方・命名・ディレクトリ構成等が異なっていないか？
- [ ] 関数・コンポーネントの粒度は適切か？

🤖 Generated with [Claude Code](https://claude.ai/code)

https://claude.ai/code/session_01Cv4a6GH8YuxUe328FttVhH

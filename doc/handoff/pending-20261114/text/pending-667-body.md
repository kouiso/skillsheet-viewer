## Issue リンク / Link to Issue

Closes #633 （親 PBI: #626）

分類: このアプリへの機能要求（スキルシートのデータ変更ではない）。

### 概要

未保存のまま版の履歴を開くと、保存が直らない失敗でも「履歴を開く前の保存を完了できませんでした…もう一度保存して開く」が往復していた。原因は `openHistoryAfterSave`（app/builder/builder-client.tsx）のループが、`handleSave` の失敗を成功か失敗かの2値でしか見ていなかったこと。

- `handleSave` が失敗の種類を ref（`saveFailureRef`）に残す: 競合（CONFLICT）→ `conflict`、期間投影の不一致（クライアント側の検証）→ `invalid-period`、サーバの入力エラー（BAD_REQUEST）→ `invalid`、NOT_FOUND → `not-found`、PRECONDITION_FAILED → `precondition`、通信などは null（従来どおり）。未確定の項目名（`hasBlockedDraft()`）でも ref には `invalid` が入る（builder-client.tsx:883）が、履歴を開く経路はその手前（:1028・:1043）で止まるので、:1049 の分岐には届かない（別の「未確定の項目名を確認してください」の経路）。画像のファイル名は `invalid-*.png` が `invalid-period`、`invalid-server-*.png` が `invalid` の画面
- 競合: `handleSave` が理由と次の操作（最新を読み込む／あとで）を出し終えているので、同じ確認を重ねずに編集へ戻る
- 入力エラー（`invalid-period` と `invalid`）: 板「S-11」の文言で「未保存の変更を保存できません。」＋理由＋「このまま履歴を開くと、未保存の変更は失われます。」。ボタンは「変更を捨てて履歴を開く」（`danger: true`）と「編集に戻る」。理由の文は原因が分かるかどうかで分ける
  - 名指しの文（`invalid-period`）: 手元で原因が分かる期間の不一致。「案件の期間の入力に、保存できないものがあります（開始・終了の日付が期間の表記と合っていません）。」
  - 汎用文（`invalid`）: サーバの BAD_REQUEST は原因が分からないので「入力内容に、保存できない箇所があります。」
- 「変更を捨てて履歴を開く」: 編集欄を最後に保存した内容へ戻し（`lastSavedStateRef` に保存済みの items・title を持つ。`discardUnsavedEdits`）、選択ブロックと選択案件を保存済みの中から選び直し、捨てたブロックの「削除を取り消す」（`deletedBlock`）も消し、isDirty を偽にしてから履歴を開く。履歴の復元ボタンは止まらない（`restoreBlockedReason` が渡らない）
- NOT_FOUND・PRECONDITION_FAILED: invalid に混ぜず（理由の文が嘘になるため）、それぞれ短い別の文のトーストを出して往復を抜ける
- 通信など直りうる失敗: 従来どおり「もう一度保存して開く」
- 後追い: UNAUTHORIZED は保存側が別の導線（セッション切れ）を出す既存の経路で、この PR では触っていない。捨てた後も、案件の変更履歴（`history`）は積まれたまま残る（未確認。画面では試していない）。直すなら別 SBI

### 見て欲しいポイント

- [ ] `saveFailureRef` の付け方（BAD_REQUEST を「直らない」に入れた判断、期間不一致を `invalid-period` に分けて文を名指しにした判断）
- [ ] 捨てて開く時に編集欄を保存済みへ戻す `discardUnsavedEdits`（selectedBlockId と selectedProjectId の選び直し、`deletedBlock` の消去を含む）

### 見なくてもよいポイント

- [ ] doc/save-failure-reason-evidence/ の PNG 16枚（証跡）

### 検証

- 試験（vitest・jsdom の app/builder/builder-client.test.tsx、65 本）に追加:
  - 競合で往復しない／入力エラー（BAD_REQUEST）で往復せず汎用文の理由が出る（確認ボタンが `danger` の見た目＝`border-destructive` / `text-destructive` で出ることも確かめる）／入力エラーで捨てて開ける（開いた後に復元が止められておらず、履歴を閉じると編集欄が保存済みの内容）／NOT_FOUND で往復しない
  - クライアント側の期間不一致（保存 API を呼ばない経路）で往復せず、期間を名指しした理由が出る
  - 捨てた後、保存済みに案件があるのに未保存の案件ブロックを選んでいた場合は、編集欄が保存済みの案件を出す（選択案件の選び直し）
  - 捨てた後、未保存ブロックの「削除を取り消す」が残らない
- 試験が修正を守っていることを、修正を一時的に外して確かめた（各回の後に戻して、作業ツリーはきれい）: `discardUnsavedEdits()` の呼び出しを外すと「捨てて開く」の試験が落ちる／選択案件の選び直しを外すと選び直しの試験が落ちる／`deletedBlock` の消去を外すと「削除を取り消す」の試験が落ちる／`danger: true` を外すと確認ボタンの試験が落ちる。いずれも戻すと通る
- 4d053a5 で `pnpm lint` / `pnpm type-check` / `pnpm test` / `pnpm build` を流して成功（実行は 2026-11-14T13:43Z 前後）。`pnpm test` は jsdom 1128・node 1202（skip 1）・pdf 229（skip 7）すべて成功、失敗 0（合計 2559）。`./script/check-naming.sh` も成功
- 実画面: 本番ビルド＋使い捨て隔離 DB（合成データのみ。ネットワークを切った名前空間の中で起動し、終了後に片付けた）。**明・暗 × 1440px・390px の4条件**（deviceScaleFactor 1、開発用オーバーレイなし）で、4つの流れを撮影した（4流れ × 4条件 = 16枚）
  - 競合: 実際に別の保存で版を進めて起こした
  - 入力エラー（期間の不一致・名指しの文）: 食い違う文書はサーバが作成・保存で拒否し、DB へ直接入れても編集画面が「編集を止めています」で開かないため、画面から作れない。そこで、正しい文書を作った後、編集画面の読み込み応答（HTML 内の初期データ）の `ongoing` だけ false から true に書き換えて、画面の中で期間の表記と食い違う状態にした。保存・履歴・ダイアログは本物の実装が動き、保存 API は呼ばれない
  - 入力エラー（サーバの BAD_REQUEST・汎用文）: 保存 API の応答を BAD_REQUEST に差し替えて再現した
  - 捨てて開く→履歴で復元が押せる
  - 各条件で、ダイアログの本文が想定の文であること（汎用文の画像に「期間」が出ないことも含む）・確認が往復しないこと・横はみ出し 0（scrollWidth − clientWidth ≤ 0、390px 含む）・「捨てて開く」後に復元ボタンが押せて、履歴を閉じると編集欄が保存済みの内容であることを自動で確かめた
- 暗い配色: localStorage の `theme-mode` を使い、html に `dark` クラスが付くことを各条件で確認した。16枚のハッシュはすべて異なる（明と暗も別）。暗い方のダイアログの背景の実測は rgb(15, 19, 22)＝#0f1316（板の card と一致）、履歴画面の body の背景は rgb(10, 13, 15)＝#0a0d0f（globals.css の dark の bg）
- 証跡 16 枚（4d053a5）:
- 競合: [light-1440](https://github.com/kouiso/skillsheet-viewer/blob/4d053a5/doc/save-failure-reason-evidence/conflict-light-1440.png) / [light-390](https://github.com/kouiso/skillsheet-viewer/blob/4d053a5/doc/save-failure-reason-evidence/conflict-light-390.png) / [dark-1440](https://github.com/kouiso/skillsheet-viewer/blob/4d053a5/doc/save-failure-reason-evidence/conflict-dark-1440.png) / [dark-390](https://github.com/kouiso/skillsheet-viewer/blob/4d053a5/doc/save-failure-reason-evidence/conflict-dark-390.png)
- 入力エラー（期間の不一致・名指しの文）: [light-1440](https://github.com/kouiso/skillsheet-viewer/blob/4d053a5/doc/save-failure-reason-evidence/invalid-light-1440.png) / [light-390](https://github.com/kouiso/skillsheet-viewer/blob/4d053a5/doc/save-failure-reason-evidence/invalid-light-390.png) / [dark-1440](https://github.com/kouiso/skillsheet-viewer/blob/4d053a5/doc/save-failure-reason-evidence/invalid-dark-1440.png) / [dark-390](https://github.com/kouiso/skillsheet-viewer/blob/4d053a5/doc/save-failure-reason-evidence/invalid-dark-390.png)
- 入力エラー（サーバの BAD_REQUEST・汎用文）: [light-1440](https://github.com/kouiso/skillsheet-viewer/blob/4d053a5/doc/save-failure-reason-evidence/invalid-server-light-1440.png) / [light-390](https://github.com/kouiso/skillsheet-viewer/blob/4d053a5/doc/save-failure-reason-evidence/invalid-server-light-390.png) / [dark-1440](https://github.com/kouiso/skillsheet-viewer/blob/4d053a5/doc/save-failure-reason-evidence/invalid-server-dark-1440.png) / [dark-390](https://github.com/kouiso/skillsheet-viewer/blob/4d053a5/doc/save-failure-reason-evidence/invalid-server-dark-390.png)
- 捨てて開く→履歴で復元: [light-1440](https://github.com/kouiso/skillsheet-viewer/blob/4d053a5/doc/save-failure-reason-evidence/discard-restore-light-1440.png) / [light-390](https://github.com/kouiso/skillsheet-viewer/blob/4d053a5/doc/save-failure-reason-evidence/discard-restore-light-390.png) / [dark-1440](https://github.com/kouiso/skillsheet-viewer/blob/4d053a5/doc/save-failure-reason-evidence/discard-restore-dark-1440.png) / [dark-390](https://github.com/kouiso/skillsheet-viewer/blob/4d053a5/doc/save-failure-reason-evidence/discard-restore-dark-390.png)

### 板（#626 のコメントの値）との照合

文言・ボタン名・理由の出し方は板（S-11 / E-07）どおり。**一致しなかった点**（共有のダイアログ部品 `use-workspace-confirm.tsx` の見た目で、この SBI では変えていない。別 SBI で扱う）:

| 項目 | 板 | 実装（既存部品） |
| --- | --- | --- |
| 最大幅 | 480px | max-w-lg（512px） |
| 角丸 | 8px | rounded-xl（12px） |
| 内側余白 | 24px | p-5（20px） |
| 390px のボタン | 縦に並べて幅いっぱい | 横並びのまま（はみ出しは無い） |
| ボタンの並び | 板の記載順 | 取消が左・確認が右 |
| 色 | 板の値 | ダイアログ背景は #0f1316 と一致（暗）。そのほかの数値照合はしていない（未確認） |

### その他(あれば)

- 2026-11-14 は Vercel の無料プランの 1 日の配信回数を使い切っていて、この head の「Vercel」の状態が failure になることがある（Deployment rate limited — retry in 24 hours）。コードの失敗ではない。検査は持ち主の裁定どおり手元の検査（LOCAL-CHECK のコメント）で見る。

入力エラーの時は、`handleSave` の既存トースト（「保存できない入力があります…」「保存に失敗しました」）も同時に出る。

---

### PR チェックポイント

- [x] タイトルに タスク管理ツール のチケット番号が入っているか
- [x] 複数の変更が 1 つの PR に入り込んでいないか
- [x] 開発環境修正はなし
- [x] AdminXXX or OwnerXXX の修正はなし

### レビュー観点

- [ ] 想定通りに動作するか
- [ ] より良い書き方はないか？
- [ ] より良い設計はないか？
- [ ] 他の部分と書き方・命名・ディレクトリ構成等が異なっていないか？
- [ ] 関数・コンポーネントの粒度は適切か？

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01Cv4a6GH8YuxUe328FttVhH

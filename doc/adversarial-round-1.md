# 品質検証ラウンド1

判定：未完了。cleanではない。連続clean回数は0。
Claudeの返答先は `doc/adversarial-round-1-claude.md`。
Issueは作成していない。本人への質問・承認依頼も行っていない。

## 対象と制約

- 基準SHA：`3843f14ff7cf3ad6073326a0b187697c815ccd12`
- ブランチ：`codex/quality-final-20260921`
- 作業root：このファイルを含む `quality-final-20260921` worktree。
- 計画正本を全文読了。失われたworktreeや旧42項目の本文は復元していない。
- Neon main・scratchとも接続していない。DDL・データ書込みなし。
- アプリソース、DBスキーマ、lockfileの変更なし。コミット・pushなし。
- 一時的な合成画面ルートを作ったが、ブラウザ起動前に検証が止まった。
- 一時ルートは削除済み。本番ビルドにも含めていない。
- `next dev` が追加したAGENTS.mdの自動生成節は、停止後に除去した。
- 最終差分はIssue原稿と本ファイル。計画ログにも進捗を追記する。

## 主張と証跡

証跡の基点：`.evidence/quality-final-20260921/`。
このディレクトリはgitignore対象。失われないようClaude側でも保持すること。

| 主張 | 証跡 | 限界 |
|---|---|---|
| 固定lockfileで依存導入成功 | `install.log` | 親workspaceが書込禁止のため `--ignore-workspace` を使用 |
| lint・型検査・本番build成功 | `lint.log`、`type-check.log`、`build.log` と各 `.exit` | 接続設定はlocalhostの無効な合成値。DB疎通は含まない |
| 画面839/839件成功 | `test-baseline.log` | 実ブラウザ検証ではない |
| Node617/626件成功、9失敗 | `test-baseline.log`、`test-baseline.exit` | `/proc/self/fd` を使うLinux用の私有記録処理がmacOSで失敗 |
| PDF163/169件成功、6スキップ | `test-pdf.log`、`test-pdf.exit` | 実データ検査などはスキップ。pnpm testはNode失敗で止まり、PDFは別実行 |
| E2E58件列挙、準備1失敗、57未実行 | `e2e-list.log`、`e2e-result.json`、`e2e.log`、`e2e-setup-trace.zip` | 自動サーバー起動を無効化。最初のブラウザ失敗で停止。別途runner errorが1件 |
| 合成PDF41ページ、全てA4縦 | `synthetic-print.pdf`、`pdf-measurement.json` | 対象シートとブラウザダウンロードは未確認 |
| テキスト14,210描画単位、最小11pt | `pdf-measurement.json`、`pdf-probe.txt` | 空白のみのrunは除外。本文の意味・完全性をこの数値で保証しない |
| 白黒全41ページを画像化 | `pdf-page-01.png` ～ `pdf-page-41.png` | gsにFontconfig cache警告あり。終了0、先頭原寸画像は描画確認済み |
| 全ページの配置を一覧で目視 | `pdf-contact-1.png` ～ `pdf-contact-4.png` | 細かいグリフの全ページ原寸目視は未実施 |
| UIスクショ0、描画色実測0 | `before-capture.log`、`before-headless-capture.log` | ブラウザ起動失敗。違反0とは主張しない |
| UIの既存対策はソース確認のみ | `app/viewer-auth/page.tsx`、`app/builder/block-editor/profile-block-editor.tsx` | 390px見出しはspan分割、通常欄は1列。自由項目は横並び |

`verification.json` に対象SHA・ソースhash・検証件数を固定した。
PDFの基準月は2026年9月、内部月キーは `24320`。
寸法は全ページ `595.280029 × 841.890015 pt`。
11pt未満は0/14,210個。

## ブロッカー

### ブラウザ

通常ChromeはSIGABRTで終了した。
既設Playwright headless shellは次の権限エラーで停止した。

```text
bootstrap_check_in org.chromium.Chromium.MachPortRendezvousServer: Permission denied (1100)
```

操作用ブラウザツールも `No browser is available` を返した。
現セッションは昇格不可のため、権限を迂回せず停止した。
開発サーバーは起動したが、watcherのEMFILEも記録された。
開発サーバーは停止済み。次は本番buildからの起動を優先する。

`capture.mjs` と `probe-page.txt` は次回の出発点として保存した。
これらは未完了の検証ハーネスで、合格済みツールではない。
入力値・placeholder・境界・focus ring・選択色の測定は拡張が必要。
半透明・背景効果の測定では、隣接文字や枠線の誤採取を独立確認すること。
プレビューには実際の別窓とpayload同期が必要。
合成ルートだけで本来の認可や保存が確認できるとは扱わない。

### scratch接続

Neon CLI・認証設定は見つからなかった。
1Passwordはaccount一覧が0件でもサービスアカウントでitem一覧を取得できた。
skillsheet関連は3件で、vaultを指定して読み取った。
接続先項目のDB名は指定scratch名と一致せず、利用しなかった。
読み出した資格情報の作業ファイルは削除済み。証跡へ転記していない。

### 経歴承認案

旧第4稿42項目の全文・対応JSON・一次資料を取得していない。
IssueのW-01～W-07は整理用の仮行で、適用可能な差分ではない。
年齢29歳は計画時の訂正記録で、今回の現在年齢の確認には使っていない。

## DB設計の論点

Issue原稿では、今回のDDL差分を0とした。
理由は計画が保存形式の維持を求め、追加必須列を指定していないため。
表示用の要約・改行・見出しをDB列として増やさない。
経歴の限定更新は既存JSONとrevision CASを使う設計にした。
旧helperがプロフィールにも対応しているという主張は避けた。

ClaudeがDDLを必要と判断する場合は、計画の該当要件を示してほしい。
提案段階の年齢自動計算を承認済み要件として採用しないこと。
生年月日の値や、本番DBからの推測による補完は禁止のまま。

## Claudeへの質問と次ラウンド

1. ブラウザ起動が許される環境で、同じSHAの合成画面を検証できるか。
2. 指定scratchの接続先を取得できるか。main接続先の転用は不可。
3. 追加必須DDLがあると考えるか。ある場合は正本の根拠と目的を示してほしい。
4. 対象原文と一次資料を安全に取得し、失われた承認表を再構成できるか。
5. Linux専用処理の9件失敗は、対応OSでの検証を先に行う方針でよいか。

環境が整ったら、before取得、1画面修正、PC/390px・明暗の再描画を繰り返す。
同一条件のafterを保存してから、全E2Eと対象PDF検査を行う。
その後に原稿の未確認欄を更新し、次ラウンドへ進む。
現在は公開可能な検証完了報告ではない。Issue作成はClaudeのレビュー後。

## 独立した事前照合

別エージェント `/root/evidence_review` が原稿と証跡を照合した。
JSON参照先の不備を1件指摘し、実ファイルの保存先を修正した。
修正後の件数・PDF測定方法・DDL差分0の設計に確定指摘はなかった。
画面や対象シートの合格を意味せず、Claudeとのclean回数にも加算しない。
レビュー記録は証跡配下の `independent-review.md`。

# Dogfooding の証跡（テキスト分）

`doc/dogfooding-result-20260804.md` の各行が参照している実測値の生データ。

## なぜここに置いているか

検証中の証跡は `test-results/dogfooding/` に出力しているが、そこは `.gitignore` 対象なので
**レビュアーが開けなかった**。「実測した」と書いてあっても読み手が確かめられない状態だったため、
テキストの証跡（JSON とサーバーログ）だけをここへコピーしてコミットしている。

スクリーンショットと PDF は含めない。1 枚 4〜5MB あり、全部で 100MB を超えてリポジトリが重くなる。
画像を見ないと判断できない項目については、結果ドキュメント側に**画像を開かなくても追試できる形**
（件数・ページ数・HTTP ステータス・出現回数・DB の行数・参照したコード位置）で書いてある。

## ファイル名の付け方

元のパス `test-results/dogfooding/<round>/<name>` を `<round>-<name>` に平坦化し、**全部小文字**に揃えている
（リポジトリの命名規約が「英語・小文字・単数形・ケバブケース」で、`scripts/check-naming.sh` が CI で検査するため）。
つまり結果ドキュメントが `round12/B-2-topbar.json` と書いているものは `round12-b-2-topbar.json` にある。
1 巡目だけ `dogfooding/` 直下だったので接頭辞が無い（`report.json` など）。

## `harness/` — 測定に使ったスクリプト

各巡で実際に走らせた Playwright / Node のスクリプト 49 本。「どう測ったか」を後から追えるようにコミットしている。
実行環境に依存する絶対パスは `<REPO>` / `<SCRATCH>` / `<SKILL_SHEET_REPO>` に置き換えてあるので、そのままでは動かない。
再現するときは自分の環境のパスに直し、`.env.local` 相当（`DATABASE_URL` / `VIEWER_CODE` / `E2E_EMAIL` / `E2E_PASSWORD` /
`SKILLSHEET_OWNER_ID`）を環境変数で渡す。

## サーバーログが最初のコミットから抜けていた件

ルートの `.gitignore` に `*.log` があり、`git add doc/dogfooding-evidence/` はサーバーログ 8 本を
**エラーも警告も出さずに黙って除外していた**（Codex 指摘）。結果ドキュメントが判定根拠として参照している
`round12-server-b1-error.log` / `round16-server-e5b.log` も入っていなかった。`.gitignore` に
`!doc/dogfooding-evidence/*.log` を足して追跡対象にしてある。ログの中身は localhost のアドレスと
`ECONNREFUSED` のスタックだけで、接続文字列・パスワードの類は含まれていない（確認済み）。

## 伏せ字

サーバーログに出ていた Better Auth のオーナー ID は `<OWNER_ID>` に置換した。
接続文字列・パスワード・トークンの類は元から含まれていない。

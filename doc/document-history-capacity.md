# 版履歴の容量と保存負荷の計測（#574）

版履歴が「どのくらいで容量上限に届くか」を、再現できる計測と前提つきの月間モデルで判断するための資料。
正本の仕様は [document-history.md](document-history.md)。ここに書く数字は**合成データでの計測**で、Neon 本番の実測ではない。
本番には履歴表がまだ無いので、本番の月間履歴は測れない（2026-10-21 13:23 JST の読取でも `document_versions` / `deleted_documents` は 0 件。月間の履歴増分は「未測定」）。
上限に届く月の計算では、履歴以外の容量に本番の実測（branch の論理容量 48.4 MiB、2026-10-21）を使う。下の「本番の実測」を参照。

## 再現手順

```bash
# PostgreSQL 16 以上の initdb / pg_ctl / psql を PATH に置く（例: Homebrew の postgresql@16）
PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH" ./script/measure-document-history.sh
# 出力された report.json（集計だけ）から表を作る
pnpm exec tsx script/history-capacity-report.ts --measurement /tmp/skillsheet-history-measure.XXXXXX/report.json
```

- 新規ローカル cluster を作り、TCP を閉じて Unix socket だけで動かす。`PG*` 環境変数と `DATABASE_URL` は捨てる。本番・共有 DB へは接続しない。
- 正本の migration、read/write 境界、`script/sql/install-document-history.sql` を入れた DB に、アプリと同じ `replace_sheet`（CAS）で保存する。
- 合成本文は md5 の連結で、ほぼ圧縮できない最悪側。1 保存で 1 ブロックだけ本文を変える。
- 同じシートを 2 つの writer が同時に保存する競合（`same-sheet-contention`）も毎回測る。各 writer の保存数は通常日と同じ。
- サンプル数は `HISTORY_MEASURE_BURST_SAVES`（既定 200）・`HISTORY_MEASURE_NORMAL_SAVES`（既定 15）・`HISTORY_MEASURE_SMALL_BYTES`（既定 33,000）・`HISTORY_MEASURE_LARGE_BYTES`（既定 95,000）で変えられる。
- 終了時に合成 DB の data directory は消し、`report.json` とログだけ残す。止めたいときは中断すれば終わる（既存データには触れない）。
- 容量の照会は `script/sql/history-size-report.sql`（READ ONLY で実行。本文・title は読まない）。#577 の監視でも同じ照会を使う。

## 測るもの

| 項目 | 測り方 |
|---|---|
| 版数 | `document_versions` の件数。合成 DB 試験として、シートごとに「版数 = 作成 1 ＋ 結果が OK だった保存の数」「最新 revision = OK の数」を毎回確かめる。保存数の設定値ではなく結果で数えるので、拒否された保存があっても計測は最後まで走る |
| 本文列 | `pg_column_size(blocks)`（圧縮後）と `octet_length(blocks::text)`（元の JSON） |
| 総容量 | `pg_total_relation_size` を heap・TOAST・索引に分けて出す（heap＋TOAST＋索引＝総容量。二重に数えない） |
| 保存直後と詰めた後 | 保存直後（autovacuum 停止、dead tuple 込み）と `VACUUM FULL` 後の両方 |
| WAL | 計測の前後の `pg_current_wal_lsn()` の差 |
| 保存遅延 | psql `\timing` の往復時間。p50 / p95 は nearest-rank |
| ロック待ち・失敗率 | ロック待ちは `log_lock_waits` の待ち行数（`deadlock_timeout=1ms` なので 1ms 以上の待ち）。失敗率は OK 以外の結果（CONFLICT・ERROR）の割合 |
| 保存の手順 | writer ごとに、直前に受け取った revision で `replace_sheet` の CAS をかける。CONFLICT や ERROR の後は最新の revision を読み直して続ける（別タブの保存に負けたタブが再読込する動き）。1 回の失敗が後の保存に連鎖しない |

## 結果（2026-10-21、SHA 9cc416c）

| scenario | 保存数（OK/試行） | 1版（詰めた後） | 1版（保存直後） | WAL/保存 | p50 | p95 | 失敗率 | ロック待ち |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 約33KB を 200 連続保存 | 200/200 | 37.6 KB | 74.9 KB | 117.3 KB | 1.9 ms | 3.5 ms | 0 | 0 |
| 約95KB を 200 連続保存 | 200/200 | 103.9 KB | 207.7 KB | 334.5 KB | 4.9 ms | 16.0 ms | 0 | 0 |
| 33KB・95KB の 2 シートを並行で 15 保存ずつ | 30/30 | — | — | 225.8 KB | 4.5 ms | 28.7 ms | 0 | 0 |
| 同じ 33KB のシートへ 2 writer が 15 保存ずつ | 15/30 | 37.1 KB | 76.5 KB | 117.4 KB | 1.9 ms | 3.8 ms | 0.5（CONFLICT 15・エラー 0） | 15 |

macOS・PostgreSQL 16.15・autovacuum 停止。容量は実行ごとにほぼ同じ値になる（10-20 の SHA 47e4301 では約95KB の詰めた後が 104.0 KB）。遅延は共有マシンの負荷で実行ごとに変わり、Neon のネットワーク遅延やアプリ処理を含まない。
表の元は `script/fixture/history-measure-report.json`（この計測の report.json）。`pnpm exec tsx script/history-capacity-report.ts --measurement script/fixture/history-measure-report.json` の「実測」表と同じ値を丸めて載せている。

分かったこと:

- **保存直後の履歴は詰めた後の約 2 倍**（207.7 / 103.9）。1 回の保存で trigger が履歴行を 3 回書くため。親の AFTER UPDATE で新しい版を INSERT し（この時点ではまだ旧本文）、blocks の DELETE と INSERT の statement trigger が同じ行を 2 回 UPDATE する。全文の TOAST 書き込みが 2 回起き、1 回分が dead tuple として残る。autovacuum が追いつけば再利用されるが、ファイルは縮まない。
- **WAL は 1 保存で本文の約 3.5 倍**（334.5KB / 95KB）。履歴の TOAST 2 回分と、blocks 表の削除・挿入分を合わせた量。
- 別シートの並行保存は失敗・ロック待ちとも 0。互いを待たない。
- **同じシートへの同時保存は、半分が CONFLICT になる**（30 件中 15 件、エラー 0）。ロック待ち（1ms 以上）も 15 回で CONFLICT と同じ数。片方の保存がもう片方の行ロックを待ち、待ち終わってから revision が合わず拒否される動きと合う。待ちは短く、p95 は 3.8 ms。拒否された保存は版を増やさないので、版数は「作成 1 ＋ OK 15」と一致し、容量への影響は無い。負けた writer は最新を読み直して続ける。

## モデルの前提

```
月間の新しい版 = シート数 × 月の活動日 × 1 活動日あたりの保存数 ＋ save 以外の版（restore / delete など）
```

`src/db/history-capacity-model.ts`（純粋関数）で計算し、`src/db/history-capacity-input.ts` に入力の区分（実測・既存報告・仮定・外挿）と出典を持たせる。
初回 baseline は 1 シート 1 版。save 以外の版はどの保持案でも消さない前提なので、月数に比例して増え続ける。1 か月は 30 日として扱う。
日次・月次の代表版は、save があった日（月）にだけ 1 版残る。

600ms の debounce は「手を止めてから保存するまでの待ち」で、24 時間保存し続ける頻度ではない。high の 1 日 200 保存は 10/14 コメントの「いちばん重い月」の仮定を使う。

次の境界の間は生成結果をそのまま貼っている。手で直さず、次のコマンドの出力の該当部分で置き換える（`script/history-capacity-report.test.ts` が文書と生成結果の一致を確かめる）。入力は `script/fixture/history-measure-report.json`（上の計測の report.json。集計値だけで本文は含まない）。

```bash
pnpm exec tsx script/history-capacity-report.ts --measurement script/fixture/history-measure-report.json
```

<!-- history-capacity-report:begin -->
## 月間モデル（保持案: 全版、1版 103.9 KB）

月間版数 = シート数 × 活動日 × 1活動日あたりの保存数 ＋ save 以外の版。初回 baseline は1シート1版。

| 負荷 | 前提 | 区分 | 月間の新しい版 | 月間増分 | 12か月後の履歴 | 上限到達 |
|---|---|---|---:|---:|---:|---|
| low | 1シート×月4日×5保存＋非save 1/月 | 入力は仮定、結果は外挿 | 21 | 2.1 MiB（2.2 MB） | 25.1 MiB（26.3 MB） | 36か月内に届かない |
| reported-pace | 1シート×月15日×1保存＋非save 1/月 | 入力は外挿、結果は外挿 | 16 | 1.6 MiB（1.7 MB） | 19.1 MiB（20.0 MB） | 36か月内に届かない |
| normal | 1シート×月10日×30保存＋非save 2/月 | 入力は仮定、結果は外挿 | 302 | 29.9 MiB（31.4 MB） | 359.1 MiB（376.5 MB） | 33か月目 |
| high | 3シート×月20日×200保存＋非save 10/月 | 入力は仮定、結果は外挿 | 12030 | 1191.7 MiB（1249.6 MB） | 14301.0 MiB（14995.6 MB） | 1か月目 |
| reported-heavy | 1シート×月10日×200保存＋非save 0/月 | 入力は既存報告、結果は外挿 | 2000 | 198.1 MiB（207.7 MB） | 2377.6 MiB（2493.1 MB） | 5か月目 |

上限 = 1024.0 MiB（実測 2026-10-21 13:23 JST。10/14 報告と同じ値）、履歴以外 = 48.4 MiB（実測 2026-10-21 13:23 JST、branch の論理容量。10/14 報告の 9.2 MiB は neondb だけの値で、上限が数える量ではない）、空き = 975.6 MiB。

## 保持案ごとの比較（月次版の累積を含む）

間引いた案でも、365日より古い save は1か月1版ずつ、save 以外の版は全部が残り続ける。履歴上限 256.0 MiB は 10/14 コメントの案にある履歴だけの上限（既存報告）。

| 負荷 | 保持案 | 区分 | 12か月後の履歴 | 36か月後の履歴 | 履歴 256.0 MiB 到達 | 上限到達 |
|---|---|---|---:|---:|---|---|
| low | keep-all | 入力は仮定、結果は外挿 | 25.1 MiB（26.3 MB） | 75.0 MiB（78.6 MB） | 36か月内に届かない | 36か月内に届かない |
| low | tiered-30-365 | 入力は仮定、結果は外挿 | 7.6 MiB（8.0 MB） | 12.5 MiB（13.1 MB） | 36か月内に届かない | 36か月内に届かない |
| low | tiered-7-365 | 入力は仮定、結果は外挿 | 6.4 MiB（6.8 MB） | 11.3 MiB（11.8 MB） | 36か月内に届かない | 36か月内に届かない |
| reported-pace | keep-all | 入力は外挿、結果は外挿 | 19.1 MiB（20.0 MB） | 57.2 MiB（59.9 MB） | 36か月内に届かない | 36か月内に届かない |
| reported-pace | tiered-30-365 | 入力は外挿、結果は外挿 | 19.1 MiB（20.0 MB） | 24.2 MiB（25.3 MB） | 36か月内に届かない | 36か月内に届かない |
| reported-pace | tiered-7-365 | 入力は外挿、結果は外挿 | 19.1 MiB（20.0 MB） | 24.2 MiB（25.3 MB） | 36か月内に届かない | 36か月内に届かない |
| normal | keep-all | 入力は仮定、結果は外挿 | 359.1 MiB（376.5 MB） | 1077.1 MiB（1129.4 MB） | 9か月目 | 33か月目 |
| normal | tiered-30-365 | 入力は仮定、結果は外挿 | 43.1 MiB（45.2 MB） | 50.4 MiB（52.9 MB） | 36か月内に届かない | 36か月内に届かない |
| normal | tiered-7-365 | 入力は仮定、結果は外挿 | 23.0 MiB（24.1 MB） | 30.3 MiB（31.8 MB） | 36か月内に届かない | 36か月内に届かない |
| high | keep-all | 入力は仮定、結果は外挿 | 14301.0 MiB（14995.6 MB） | 42902.3 MiB（44986.3 MB） | 1か月目 | 1か月目 |
| high | tiered-30-365 | 入力は仮定、結果は外挿 | 1290.1 MiB（1352.8 MB） | 1369.7 MiB（1436.3 MB） | 1か月目 | 1か月目 |
| high | tiered-7-365 | 入力は仮定、結果は外挿 | 403.0 MiB（422.6 MB） | 482.6 MiB（506.1 MB） | 1か月目 | 36か月内に届かない |
| reported-heavy | keep-all | 入力は既存報告、結果は外挿 | 2377.6 MiB（2493.1 MB） | 7132.6 MiB（7479.1 MB） | 2か月目 | 5か月目 |
| reported-heavy | tiered-30-365 | 入力は既存報告、結果は外挿 | 209.1 MiB（219.3 MB） | 211.7 MiB（222.0 MB） | 36か月内に届かない | 36か月内に届かない |
| reported-heavy | tiered-7-365 | 入力は既存報告、結果は外挿 | 71.1 MiB（74.6 MB） | 73.7 MiB（77.3 MB） | 36か月内に届かない | 36か月内に届かない |

- keep-all: 全版。出典: 現行仕様（自動削除なし）
- tiered-30-365: 30日全版→365日まで1日1版→以降1か月1版。出典: #564 10/14 コメントの案（承認済みとは扱わない）
- tiered-7-365: 7日全版→365日まで1日1版→以降1か月1版。出典: 同コメントの「履歴が 256MiB を超えたら全版の期間を7日に縮める」

### 10/14 の重い月を1版の大きさ別に再計算

負荷は reported-heavy（1シート×月10日×200保存＋非save 0/月）。10/14 コメントの「約115MB」は 1版 47.5KB と 30日全版の案での値。

| 1版 | 1版の区分 | 保持案 | 区分 | 12か月後の履歴 | 36か月後の履歴 | 履歴 256.0 MiB 到達 |
|---|---|---|---|---:|---:|---|
| 47.5 KB（PR #444、本文列だけ） | 既存報告 | tiered-30-365 | 入力は既存報告、結果は外挿 | 95.6 MiB（100.3 MB） | 96.8 MiB（101.5 MB） | 36か月内に届かない |
| 47.5 KB（PR #444、本文列だけ） | 既存報告 | tiered-7-365 | 入力は既存報告、結果は外挿 | 32.5 MiB（34.1 MB） | 33.7 MiB（35.3 MB） | 36か月内に届かない |
| 103.9 KB（詰めた後） | 実測 | tiered-30-365 | 入力は既存報告、結果は外挿 | 209.1 MiB（219.3 MB） | 211.7 MiB（222.0 MB） | 36か月内に届かない |
| 103.9 KB（詰めた後） | 実測 | tiered-7-365 | 入力は既存報告、結果は外挿 | 71.1 MiB（74.6 MB） | 73.7 MiB（77.3 MB） | 36か月内に届かない |
| 207.7 KB（保存直後） | 実測 | tiered-30-365 | 入力は既存報告、結果は外挿 | 418.1 MiB（438.4 MB） | 423.2 MiB（443.8 MB） | 1か月目 |
| 207.7 KB（保存直後） | 実測 | tiered-7-365 | 入力は既存報告、結果は外挿 | 142.2 MiB（149.1 MB） | 147.3 MiB（154.5 MB） | 36か月内に届かない |

## WAL と PITR の保持

容量上限（`branch_logical_size_limit`）が数えるのは論理データ量（表・索引など DB の大きさ）。PITR のための WAL（Neon の History）とスナップショットは別の計量で、この上限には入らない。だから上の上限到達には WAL を足していない。
出典: Neon docs（2026-10-21 閲覧）: https://neon.com/docs/postgres/backup-restore/history-window 、https://neon.com/docs/introduction/usage-metrics 、https://neon.com/docs/reference/glossary

WAL は保持窓のあいだ残る。1版の WAL 334.5 KB（合成の実測）× 窓に入る版の最大数で数える。窓の長さはプランで決まる。この project は free_v3・保持窓 6時間（21600秒）を実測した（2026-10-21 13:23 JST）ので、今の値は「6時間」の行。ほかの行はプランを上げた場合の候補。Free の History は 1GB が上限。

| 負荷 | 保持窓 | 区分 | 窓に入る版（最大） | 残る WAL |
|---|---|---|---:|---:|
| low | 6時間（Free の上限） | 入力は仮定、結果は外挿 | 5.0 | 1.6 MiB（1.7 MB） |
| low | 1日（Launch・Scale の既定） | 入力は仮定、結果は外挿 | 5.0 | 1.6 MiB（1.7 MB） |
| low | 7日（Launch の上限） | 入力は仮定、結果は外挿 | 5.2 | 1.7 MiB（1.8 MB） |
| low | 30日（Scale の上限） | 入力は仮定、結果は外挿 | 21.0 | 6.7 MiB（7.0 MB） |
| reported-pace | 6時間（Free の上限） | 入力は外挿、結果は外挿 | 1.0 | 0.3 MiB（0.3 MB） |
| reported-pace | 1日（Launch・Scale の既定） | 入力は外挿、結果は外挿 | 1.0 | 0.3 MiB（0.3 MB） |
| reported-pace | 7日（Launch の上限） | 入力は外挿、結果は外挿 | 4.2 | 1.4 MiB（1.4 MB） |
| reported-pace | 30日（Scale の上限） | 入力は外挿、結果は外挿 | 16.0 | 5.1 MiB（5.4 MB） |
| normal | 6時間（Free の上限） | 入力は仮定、結果は外挿 | 30.0 | 9.6 MiB（10.0 MB） |
| normal | 1日（Launch・Scale の既定） | 入力は仮定、結果は外挿 | 30.1 | 9.6 MiB（10.1 MB） |
| normal | 7日（Launch の上限） | 入力は仮定、結果は外挿 | 90.5 | 28.9 MiB（30.3 MB） |
| normal | 30日（Scale の上限） | 入力は仮定、結果は外挿 | 302.0 | 96.3 MiB（101.0 MB） |
| high | 6時間（Free の上限） | 入力は仮定、結果は外挿 | 600.3 | 191.5 MiB（200.8 MB） |
| high | 1日（Launch・Scale の既定） | 入力は仮定、結果は外挿 | 601.0 | 191.7 MiB（201.0 MB） |
| high | 7日（Launch の上限） | 入力は仮定、結果は外挿 | 3007.0 | 959.1 MiB（1005.7 MB） |
| high | 30日（Scale の上限） | 入力は仮定、結果は外挿 | 12030.0 | 3837.1 MiB（4023.4 MB） |
| reported-heavy | 6時間（Free の上限） | 入力は既存報告、結果は外挿 | 200.0 | 63.8 MiB（66.9 MB） |
| reported-heavy | 1日（Launch・Scale の既定） | 入力は既存報告、結果は外挿 | 200.0 | 63.8 MiB（66.9 MB） |
| reported-heavy | 7日（Launch の上限） | 入力は既存報告、結果は外挿 | 600.0 | 191.4 MiB（200.7 MB） |
| reported-heavy | 30日（Scale の上限） | 入力は既存報告、結果は外挿 | 2000.0 | 637.9 MiB（668.9 MB） |

## 感度分析

保持案は 全版。上限到達は 120 か月先まで探す。どの行も前提を1つだけ変えた外挿。

### normal

| 変えた前提 | 区分 | 月間増分 | 36か月後の履歴 | 上限到達 |
|---|---|---:|---:|---|
| 基準 | 入力は仮定、結果は外挿 | 29.9 MiB（31.4 MB） | 1077.1 MiB（1129.4 MB） | 33か月目 |
| 保存数 ×0.5 | 入力は仮定、結果は外挿 | 15.1 MiB（15.8 MB） | 542.2 MiB（568.5 MB） | 65か月目 |
| 保存数 ×2 | 入力は仮定、結果は外挿 | 59.6 MiB（62.5 MB） | 2147.0 MiB（2251.3 MB） | 17か月目 |
| 保存数 ×4 | 入力は仮定、結果は外挿 | 119.1 MiB（124.9 MB） | 4286.7 MiB（4495.0 MB） | 9か月目 |
| 1版 37.6 KB（小さい本文の実測） | 入力は実測、結果は外挿 | 10.8 MiB（11.4 MB） | 390.3 MiB（409.3 MB） | 90か月目 |
| 1版 207.7 KB（保存直後・dead tuple 込み） | 入力は実測、結果は外挿 | 59.8 MiB（62.7 MB） | 2153.4 MiB（2258.0 MB） | 17か月目 |
| save 以外の版 ×10 | 入力は仮定、結果は外挿 | 31.7 MiB（33.2 MB） | 1141.3 MiB（1196.7 MB） | 31か月目 |
| シート数 ×3 | 入力は仮定、結果は外挿 | 89.8 MiB（94.1 MB） | 3231.3 MiB（3388.3 MB） | 11か月目 |
| 上限を MB で数えた場合（1,024 MB） | 入力は既存報告、結果は外挿 | 29.9 MiB（31.4 MB） | 1077.1 MiB（1129.4 MB） | 32か月目 |
| 保持案 tiered-30-365（月次版の累積込み） | 入力は既存報告、結果は外挿 | 29.9 MiB（31.4 MB） | 50.4 MiB（52.9 MB） | 120か月内に届かない |
| 保持案 tiered-7-365（月次版の累積込み） | 入力は既存報告、結果は外挿 | 29.9 MiB（31.4 MB） | 30.3 MiB（31.8 MB） | 120か月内に届かない |
| WAL（PITR 1日分）も上限に数えた場合 | 入力は実測、結果は外挿 | 29.9 MiB（31.4 MB） | 1077.1 MiB（1129.4 MB） | 33か月目 |
| WAL（PITR 7日分）も上限に数えた場合 | 入力は実測、結果は外挿 | 29.9 MiB（31.4 MB） | 1077.1 MiB（1129.4 MB） | 32か月目 |

### high

| 変えた前提 | 区分 | 月間増分 | 36か月後の履歴 | 上限到達 |
|---|---|---:|---:|---|
| 基準 | 入力は仮定、結果は外挿 | 1191.7 MiB（1249.6 MB） | 42902.3 MiB（44986.3 MB） | 1か月目 |
| 保存数 ×0.5 | 入力は仮定、結果は外挿 | 597.3 MiB（626.4 MB） | 21504.8 MiB（22549.4 MB） | 2か月目 |
| 保存数 ×2 | 入力は仮定、結果は外挿 | 2380.5 MiB（2496.1 MB） | 85697.3 MiB（89860.1 MB） | 1か月目 |
| 保存数 ×4 | 入力は仮定、結果は外挿 | 4758.0 MiB（4989.1 MB） | 171287.3 MiB（179607.7 MB） | 1か月目 |
| 1版 37.6 KB（小さい本文の実測） | 入力は実測、結果は外挿 | 431.9 MiB（452.8 MB） | 15547.0 MiB（16302.2 MB） | 3か月目 |
| 1版 207.7 KB（保存直後・dead tuple 込み） | 入力は実測、結果は外挿 | 2382.5 MiB（2498.2 MB） | 85770.7 MiB（89937.1 MB） | 1か月目 |
| save 以外の版 ×10 | 入力は仮定、結果は外挿 | 1218.5 MiB（1277.7 MB） | 43865.2 MiB（45996.0 MB） | 1か月目 |
| シート数 ×3 | 入力は仮定、結果は外挿 | 3575.2 MiB（3748.8 MB） | 128706.9 MiB（134958.9 MB） | 1か月目 |
| 上限を MB で数えた場合（1,024 MB） | 入力は既存報告、結果は外挿 | 1191.7 MiB（1249.6 MB） | 42902.3 MiB（44986.3 MB） | 1か月目 |
| 保持案 tiered-30-365（月次版の累積込み） | 入力は既存報告、結果は外挿 | 1191.7 MiB（1249.6 MB） | 1369.7 MiB（1436.3 MB） | 1か月目 |
| 保持案 tiered-7-365（月次版の累積込み） | 入力は既存報告、結果は外挿 | 1191.7 MiB（1249.6 MB） | 482.6 MiB（506.1 MB） | 120か月内に届かない |
| WAL（PITR 1日分）も上限に数えた場合 | 入力は実測、結果は外挿 | 1191.7 MiB（1249.6 MB） | 42902.3 MiB（44986.3 MB） | 1か月目 |
| WAL（PITR 7日分）も上限に数えた場合 | 入力は実測、結果は外挿 | 1191.7 MiB（1249.6 MB） | 42902.3 MiB（44986.3 MB） | 1か月目 |
<!-- history-capacity-report:end -->

### 10/14 の「約115MB」について

10/14 コメントの「95MB/月・間引き後の最悪値 約115MB」は、1 版 47.5KB（本文列だけ）・1 シート・1 日 200 保存を月 10 日という前提での値で、絶対的な最悪値ではない。

- 同じ負荷と同じ 30 日全版の案でも、1 版を実測の 104.0KB にすると 12 か月後の履歴は 209.3MiB、保存直後の 207.7KB なら 418.1MiB で、案の履歴上限 256MiB を 1 か月目で超える（再計算の表）。
- 47.5KB のままでも 95.6MiB。コメントの約 115MB より小さいのは、save の無い日は日次版が増えない数え方にしたため。
- 間引いても月次版と save 以外の版は残り続ける。保存数やシート数が増えれば、high の行のように間引いた案でも上限に届く。
- WAL と PITR の保持は容量上限の外で、別に数える（WAL の表）。

## 本番の実測（2026-10-21 13:23 JST ／ 2026-10-20 21:23 PT、10/14 の既存報告とは別）

本番 Neon への読み取りだけ（project `cool-boat-26004396`、branch main `br-empty-forest-aqe1538i`、PostgreSQL 17.11）。Neon API の describe_project / list_branches と SELECT だけで、本文・title は読んでいない。値は `src/db/history-capacity-input.ts` の `MEASURED_20261021`。

| 項目 | 値 | 備考 |
|---|---|---|
| branch の論理容量（`logical_size`） | 48.4 MiB（50,782,208 B） | 容量上限が数える量。neondb のほか `devin_repro_e2e`・`skillsheet_e2e`・`postgres` を含む |
| neondb（`pg_database_size`） | 9.2 MiB（9,609,216 B） | 10/14 の「DB 全体 9.2 MiB」はこの値に当たる |
| 容量上限（`branch_logical_size_limit_bytes`） | 1,024 MiB（1,073,741,824 B） | 10/14 報告と同じ |
| 空き | 975.6 MiB | 上限 − branch の論理容量。月間モデルの上限到達はこの空きで計算する |
| プラン / PITR の保持窓 | `free_v3` / 6 時間（`history_retention_seconds` = 21600） | WAL 表の「6時間」の行が今の値 |
| シート数 / ブロック数 | 1 / 12 | |
| revision | 16（2026-09-16〜2026-10-21） | 単点の値で、継続観測の保存頻度ではない |
| 本文（元の JSON / 圧縮後） | 95,080 B / 45,440 B | 現在の本文で、履歴行ではない。「本番約94KB」と「約45KB」の差は圧縮前後の違い |
| 履歴表 | 0 件（未導入） | 月間の履歴増分は**未測定** |

照会（すべて SELECT。本文は集計だけ）:

```sql
SELECT datname, pg_database_size(datname) FROM pg_database WHERE NOT datistemplate;
SELECT count(*) FROM pg_class WHERE relname IN ('document_versions','deleted_documents');
SELECT count(*), max(revision) FROM public.skill_sheets;
SELECT count(*), sum(octet_length(data::text)), sum(pg_column_size(data)) FROM public.blocks;
```

## 既存報告（10/14、現在の実測ではない）

[#564 の 2026-10-14 コメント](https://github.com/kouiso/skillsheet-viewer/issues/564#issuecomment-6169440684)の本番 Neon 読取による値。この計測とは別物として扱う。

| 項目 | 値 |
|---|---|
| DB 全体 | 9.2 MiB（neondb の `pg_database_size`。容量上限が数える branch の論理容量ではない） |
| 容量上限（branch の論理容量上限） | 1,024 MiB |
| シート数 | 1 |
| revision | 14（2026-09-16〜2026-10-07、約 0.5 回/日）。単点の値で、継続観測の保存頻度ではない |
| 本文 | 約 45KB（[導入前レビュー](document-history.md)の「本番約94KB」とは時点・数え方が違う。両方を既存報告として残す） |

## 未測定

- Neon 本番での保存遅延と WAL の実量。WAL は合成計測の 1 版あたりの値で外挿した。WAL・スナップショットが容量上限に入らないことは Neon の資料で確かめた（WAL の表の出典）。
- 本番の月間の履歴増分（版数・容量）。本番に履歴表が無い（2026-10-21 読取で 0 件）ので取得できない。
- 実データの圧縮率。合成本文はほぼ圧縮できない最悪側で、実データはこれより小さくなり得る。
- 本番の継続的な保存頻度と時刻分布。
- アプリ経由の 2 タブ同時編集。合成計測は DB の CAS で衝突とロック待ちを数えるだけで、衝突後の画面表示や利用者のやり直しは含まない。
- 3 つ以上の writer が同じシートを保存する競合。
- autovacuum が動く状態で、保存直後の膨らみがどこまで戻るか（ここでは止めた状態と `VACUUM FULL` 後の両端だけを測った）。

# 版履歴の容量と保存負荷の計測（#574）

版履歴が「どのくらいで容量上限に届くか」を、再現できる計測と前提つきの月間モデルで判断するための資料。
正本の仕様は [document-history.md](document-history.md)。ここに書く数字は**合成データでの計測**で、Neon 本番の実測ではない。
本番には履歴表がまだ無いので、本番の月間履歴は測れない。

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
- サンプル数は `HISTORY_MEASURE_BURST_SAVES`（既定 200）・`HISTORY_MEASURE_NORMAL_SAVES`（既定 15）・`HISTORY_MEASURE_SMALL_BYTES`（既定 33,000）・`HISTORY_MEASURE_LARGE_BYTES`（既定 95,000）で変えられる。
- 終了時に合成 DB の data directory は消し、`report.json` とログだけ残す。止めたいときは中断すれば終わる（既存データには触れない）。
- 容量の照会は `script/sql/history-size-report.sql`（READ ONLY で実行。本文・title は読まない）。#577 の監視でも同じ照会を使う。

## 測るもの

| 項目 | 測り方 |
|---|---|
| 版数 | `document_versions` の件数。合成 DB 試験として「版数 = 作成 1 ＋ 成功した保存数」を毎回確かめる |
| 本文列 | `pg_column_size(blocks)`（圧縮後）と `octet_length(blocks::text)`（元の JSON） |
| 総容量 | `pg_total_relation_size` を heap・TOAST・索引に分けて出す（heap＋TOAST＋索引＝総容量。二重に数えない） |
| 保存直後と詰めた後 | 保存直後（autovacuum 停止、dead tuple 込み）と `VACUUM FULL` 後の両方 |
| WAL | 計測の前後の `pg_current_wal_lsn()` の差 |
| 保存遅延 | psql `\timing` の往復時間。p50 / p95 は nearest-rank |
| ロック待ち・失敗率 | `log_lock_waits` の待ち行数と、OK 以外の結果・ERROR の割合 |

## 結果（2026-10-20、SHA 47e4301）

| scenario | 保存数 | 1版（詰めた後） | 1版（保存直後） | WAL/保存 | p50 | p95 | 失敗率 | ロック待ち |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 約33KB を 200 連続保存 | 200/200 | 37.5 KB | 74.9 KB | 117.3 KB | 4.2 ms | 13.3 ms | 0 | 0 |
| 約95KB を 200 連続保存 | 200/200 | 104.0 KB | 207.7 KB | 334.4 KB | 15.9 ms | 122.8 ms | 0 | 0 |
| 33KB・95KB の 2 シートを並行で 15 保存ずつ | 30/30 | — | — | 225.8 KB | 7.3 ms | 240.5 ms | 0 | 0 |

macOS・PostgreSQL 16.15・autovacuum 停止。容量は実行ごとに同じ値になる。遅延は共有マシンの負荷で実行ごとに変わり、Neon のネットワーク遅延やアプリ処理を含まない。

分かったこと:

- **保存直後の履歴は詰めた後の約 2 倍**（207.7 / 104.0）。1 回の保存で trigger が履歴行を 3 回書くため。親の AFTER UPDATE で新しい版を INSERT し（この時点ではまだ旧本文）、blocks の DELETE と INSERT の statement trigger が同じ行を 2 回 UPDATE する。全文の TOAST 書き込みが 2 回起き、1 回分が dead tuple として残る。autovacuum が追いつけば再利用されるが、ファイルは縮まない。
- **WAL は 1 保存で本文の約 3.5 倍**（334.4KB / 95KB）。履歴の TOAST 2 回分と、blocks 表の削除・挿入分を合わせた量。
- 失敗・ロック待ちは 0。別シートの並行保存は互いを待たない。

## 月間モデル

```
月間の新しい版 = シート数 × 月の活動日 × 1 活動日あたりの保存数 ＋ save 以外の版（restore / delete など）
```

`src/db/history-capacity-model.ts`（純粋関数）で計算し、`src/db/history-capacity-input.ts` に入力の区分（実測・既存報告・仮定・外挿）と出典を持たせる。
初回 baseline は 1 シート 1 版。save 以外の版はどの保持案でも消さない前提なので、月数に比例して増え続ける。1 か月は 30 日として扱う。

1 版 104.0KB（95KB 本文の詰めた後の実測）、上限 1,024MiB と履歴以外 9.2MiB（10/14 の既存報告）で全版を残した場合:

| 負荷（前提の区分） | 前提 | 月間増分 | 12 か月後の履歴 | 上限到達 |
|---|---|---:|---:|---|
| low（仮定） | 1 シート × 月 4 日 × 5 保存 ＋ save 以外 1/月 | 2.1 MiB | 25.1 MiB | 36 か月内に届かない |
| 10/14 のペース（外挿） | 1 シート × 月 15 日 × 1 保存 ＋ save 以外 1/月 | 1.6 MiB | 19.1 MiB | 36 か月内に届かない |
| normal（仮定） | 1 シート × 月 10 日 × 30 保存 ＋ save 以外 2/月 | 29.9 MiB | 359.4 MiB | 34 か月目 |
| high（仮定） | 3 シート × 月 20 日 × 200 保存 ＋ save 以外 10/月 | 1,192.7 MiB | 14,312.2 MiB | 1 か月目 |

600ms の debounce は「手を止めてから保存するまでの待ち」で、24 時間保存し続ける頻度ではない。high の 1 日 200 保存は 10/14 コメントの「いちばん重い月」の仮定を使う。

### 感度分析（normal）

| 変えた前提 | 月間増分 | 上限到達 |
|---|---:|---|
| 基準 | 29.9 MiB | 34 か月目 |
| 保存数 ×2 | 59.7 MiB | 18 か月目 |
| 保存数 ×4 | 119.2 MiB | 9 か月目 |
| 1 版 37.5KB（33KB 本文の実測） | 10.8 MiB | 94 か月目 |
| 1 版 207.7KB（保存直後・dead tuple 込み） | 59.8 MiB | 17 か月目 |
| save 以外の版 ×10 | 31.7 MiB | 32 か月目 |
| シート数 ×3 | 89.8 MiB | 12 か月目 |
| 上限を 1,024 MB（MiB でなく）で数える | 29.9 MiB | 33 か月目 |

10/14 コメントの「95MB/月・間引き後の最悪値 約115MB」は、1 版 47.5KB・1 シート・1 日 200 保存を月 10 日という前提での値で、絶対的な最悪値ではない。保存数・シート数・保存直後の膨らみ・save 以外の版の無期限増加で何倍にもなる（上の表）。

## 既存報告（10/14、現在の実測ではない）

[#564 の 2026-10-14 コメント](https://github.com/kouiso/skillsheet-viewer/issues/564#issuecomment-6169440684)の本番 Neon 読取による値。この計測とは別物として扱う。

| 項目 | 値 |
|---|---|
| DB 全体 | 9.2 MiB |
| 容量上限（branch の論理容量上限） | 1,024 MiB |
| シート数 | 1 |
| revision | 14（2026-09-16〜2026-10-07、約 0.5 回/日）。単点の値で、継続観測の保存頻度ではない |
| 本文 | 約 45KB（[導入前レビュー](document-history.md)の「本番約94KB」とは時点・数え方が違う。両方を既存報告として残す） |

## 未測定

- Neon 本番での保存遅延・WAL、バックアップ（履歴保持期間）が持つ容量と、上限の数え方にそれらが入るか。
- 実データの圧縮率。合成本文はほぼ圧縮できない最悪側で、実データはこれより小さくなり得る。
- 本番の継続的な保存頻度と時刻分布。
- autovacuum が動く状態で、保存直後の膨らみがどこまで戻るか（ここでは止めた状態と `VACUUM FULL` 後の両端だけを測った）。

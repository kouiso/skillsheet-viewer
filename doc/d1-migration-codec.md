# D1 移行のオフライン変換・照合（#598）

Vercel を維持し、Workers と同じ D1 を正本にする [#598](https://github.com/kouiso/skillsheet-viewer/issues/598) のうち、移送する値の境界を先行実装した。現在のアプリ・認証・DB接続先には組み込んでいない。DBへの接続、export/import、SQL生成・実行、設定変更、デプロイは行わない。

2026-10-22 の着手時は main `0939f6b`。#593 の merge `b949f44` が祖先であることと、公開中PRが0件であることを確認した。既存の [全版保持](document-history.md)・[保持方針](document-history-retention.md)・[監視](document-history-operation.md) は再実装しない。本番はコードと同じスキーマとは限らず、この fixture を本番の棚卸し結果とは扱わない。

## 実装と入口の契約

- `script/d1-migration-codec.ts`: `encodeMigrationRow(table, row)` が値を D1 の TEXT/INTEGER/NULL 向けに変換する。`compareMigrationTable(table, postgresRows, d1Rows)` は同じ表の件数、厳密な主キー集合、型正規化後の全行を照合する。行順は問わない。戻り値は一致判定、件数、差分件数、SHA-256だけで、本文・PK・owner・認証情報を含めない。checksumも本番由来ならアクセスを制限し、公開CI成果物に出さない。
- `script/d1-migration-json.ts`: JSONを数値トークンのまま読み、オブジェクトのキー順・数値表記を正規化する。JSON.parseによるnumber化を避け、巨大整数・小数・未知プロパティを保持する。配列順、欠落、null、文字列の内容は変えない。重複キーは拒否する。
- `script/fixture/d1-migration.json`: 合成データのみ。履歴全列と複合キー、削除復元後も残る再送防止台帳、空になった削除台帳、public外のprincipalsと旧migration台帳の例。全表・全データ所在の台帳ではない。

`MigrationTable` は schema を含む識別子、全列の順序・型・NULL可否、主キーを持つ。空の表でも契約を検証する。行の余分な列・欠落列、NULL違反、重複主キーを拒否する。未知のブロックを現行UI型へ変換したり、編集可能にするために削る処理はしない。

| 型 | PostgreSQL export の入力 | D1へ渡す値・照合時の読戻し値 |
| --- | --- | --- |
| text / uuid | 文字列 | TEXT。uuidは小文字へ統一 |
| integer | signed32bit整数のnumber | INTEGER / number |
| int64 / revision | 正規の10進文字列 | TEXT / 文字列。signed64bitの範囲、revisionは非負 |
| boolean | true / false | INTEGER / 1 または 0 |
| timestamp | offset付きの生文字列、最大6桁の小数秒 | UTCの `YYYY-MM-DDTHH:mm:ss.ffffffZ` をTEXTで保持 |
| json | `jsonb::text` 相当の生JSON文字列 | 精度を失わない正規化JSONをTEXTで保持 |
| text-array / uuid-array | 1次元配列をJSON化した生文字列 | JSON配列のTEXT。順序、重複、NULL要素を保持 |
| nullable列のSQL NULL | null | NULL。JSON文字列の `null`、空配列、falseとは別 |

exporter側は **driverが型変換する前** に bigint/JSONB/timestamptzを文字列として取り出す必要がある。丸めた値を後から文字列化しても復元できない。配列は `array_to_json(...)::text` 相当を使い、次元数と下限が通常の1次元・1始まりであることを別途確認する。多次元・特殊な下限は専用契約が必要で、黙って平坦化しない。

timestampは西暦0001〜9999の有限値だけを扱う。infinity、紀元前、範囲外、timezoneなし、7桁以上の端数、無効な日付を拒否し、未対応値を丸めない。JSONの深さは128まで。それを超える実データがあれば、事前評価して対応を追加する。テキストのUnicode正規化・空白除去・配列の並べ替えは行わない。

D1の数値APIにbigintをnumberとして渡さない。文字列を保持するTEXT列が前提で、revisionを辞書順で並べたりSQLで数値へcastして処理する設計は含まない。JSON内の巨大数値も保存・照合対象であり、SQLiteのJSON関数やアプリのJSON.parseでの精度保持を保証したものではない。D1の型変換は [公式のbind型の説明](https://developers.cloudflare.com/d1/worker-api/) を参照する。

## 独立検証

Node `22.23.4` / pnpm `10.33.0` / Python 3（標準sqlite3モジュール）を使う。

```bash
pnpm exec vitest run --config vitest.config.node.ts script/d1-migration-codec.test.ts script/d1-migration-json.test.ts
```

テストにはメモリ上のSQLite STRICTテーブルへ全fixture行をbindし、読み戻して照合する試験を含む。ファイルDB・共有DB・認証・ネットワークを使わない。1μs差、64bitの1差、owner変更、未知項目欠落、同件数のPK入替、重複PK、列欠落、不正日付、NULL/false/空配列、巨大JSON数値を検証する。これはD1/Workers実ランタイムの統合試験ではない。

## 本番移行前の残件

- 全branch/database/schema/table/view/function/trigger/constraint/index/migration台帳/外部保存物の棚卸し。全対象の扱いを記録し、この表単位APIの一致だけで「全データ一致」と判定しない。空表と未導入表も区別する。
- 一貫したsnapshotから上記契約へ取り出すexporter、分離保全先、再実行可能なimporter、表集合の完全性検証。現在の照合は全行をメモリに保持するため、実容量に合わせて分割・外部ソートを検討する。
- SQLite/D1スキーマと制約、外部キー・履歴参照・順序・既定シート・tombstoneの整合性検査。値の一致はこれらの整合性検査や復元試験の代わりではない。
- Vercelサーバー専用HTTP client、用途限定Worker API、サービス認証とエンドユーザー認可、D1 bindingの隔離、CASと原子的履歴更新、並行・途中失敗試験。principalsの移送は認可実装完了を意味しない。
- vinext/OpenNextの選定と実ランタイム適合性、Better Auth、両origin、MCP/OAuth、Drive、各出力、監視のD1適合。#590・#331は未完のまま引き継ぐ。
- 両配信先の統合・live E2E、書込停止/差分同期、切替・独立rollback・逆同期/復旧のリハーサル。認証情報の新設・保存、設定変更、契約、実DB移行・本番deploy・旧データ廃止には今回の作業権限を使わない。

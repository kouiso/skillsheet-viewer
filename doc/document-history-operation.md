# 版履歴の容量監視と運用手順

版履歴（[document-history.md](document-history.md)）の容量を見張り、復元を壊さずに運用するための手順（#577）。
ここにある監視と試験は読み取りだけで、どの版も消さない。保持方針は全版保持＋監視に決めた（[document-history.md](document-history.md)「保持方針」）。閾値はまだ本番で確かめていない値なので「候補」と書く。

## いまの状態

| 項目 | 状態 | 根拠 |
| --- | --- | --- |
| 容量の計測 | 合成データで計測済み。本番の実測ではない | [document-history-capacity.md](document-history-capacity.md)（#574） |
| 保持案 | 全版保持＋監視に決定（2026-10-21） | [document-history-retention.md](document-history-retention.md)（#575） |
| 保持案の試算 | dry-run あり。削除の経路は無い | `script/history-retention-dry-run.ts`（#576、#591） |
| 決めた方針 | 全版保持＋監視。山南敬助（副長）の決定 | [#564 の山南敬助（副長）の決定コメント（2026-10-21 17:13 JST 投稿）](https://github.com/kouiso/skillsheet-viewer/issues/564#issuecomment-6311303506) |
| 本番への導入 | 履歴表そのものが未導入（2026-10-21 13:23 JST の本番読取で `document_versions` / `deleted_documents` は 0 件、#574）。監視・保持処理とも未導入 | [document-history.md](document-history.md)「適用ゲート」 |

## 監視

### 観測を取る

`script/sql/history-size-report.sql` を READ ONLY の接続で実行し、1回の観測を JSON 1行で保存する。
本文・title は読まない。接続文字列は引数に書かず、権限 0600 の `pg_service.conf` に置いて `service=` で指す。

```sh
PGOPTIONS='-c default_transaction_read_only=on' \
  psql -X -q -At -v ON_ERROR_STOP=1 "service=<接続名>" -f script/sql/history-size-report.sql > sample-<日時>.raw.json
```

Neon の容量上限が数える branch の論理容量は SQL では読めないので、Neon API の `branch.logical_size` を同じ観測に足す。API キーは環境変数で渡し、引数やファイルに書かない。

```sh
logical=$(curl -fsS -H "Authorization: Bearer $NEON_API_KEY" \
  "https://console.neon.tech/api/v2/projects/<project_id>/branches/<branch_id>" | jq -e '.branch.logical_size')
jq -c --argjson logical "$logical" '. + {branchLogicalBytes: $logical}' sample-<日時>.raw.json > sample-<日時>.json
```

照会は接続先 DB の `pg_database_size`（`databaseBytes`）、template 以外の全 DB の和（`allDatabasesBytes`）と、`document_versions` などの heap・TOAST・索引を `pg_total_relation_size` の内訳として出す（二重に数えない）。
`transactionReadOnly` が `on` でない観測と、`branchLogicalBytes` の無い観測は、監視側で失敗として扱う。

### 判定する

```sh
pnpm exec tsx script/history-capacity-monitor.ts --sample sample-1.json --sample sample-2.json
```

観測は古い順に渡す。出力は今の容量・内訳・1日あたりの増え方・上限に届く見込み日と、次の状態のどれか。

| 状態 | 意味 | 終了コード |
| --- | --- | --- |
| normal | 候補の警告値より下 | 0 |
| warning | 履歴が警告値（候補 200MiB）以上 | 5 |
| exceeded | 履歴が上限値（候補 256MiB）以上、または branch の論理容量が 1,024MiB 以上 | 3 |
| measurement-failed | 最新の観測が読めない、READ ONLY でない、履歴表が無い、branch の論理容量が無い、内訳の和が総量と合わない、時刻が逆順 | 4 |

0 以外はすべて人に知らせる。warning を 0 にすると、終了コードで知らせる定期実行では警告が届かない。

- 増え方は最小二乗で出す。1日以上離れた観測が2点以上無ければ「未測定」とし、0 とは書かない。
- 履歴表がまだ無い本番に向けると measurement-failed になる。これは正しい結果で、0MiB と読まない。
- 200/256MiB は #564 10/14 コメントの比較案で、承認された値ではない。`--warn-mib` `--limit-mib` `--database-limit-mib` で差し替えられる。
- 1,024MiB は Neon project の `branch_logical_size_limit`（2026-10-21 に project 設定を読んで確認）。上限の判定と届く見込み日は `branchLogicalBytes`（Neon API の `logical_size`）だけで出す。
- `pg_database_size` では上限の判定をしない。2026-10-21 15:37 JST の本番読取で、neondb は 9,609,216 B、template 以外の 4 DB の和は 35,176,448 B、branch の論理容量は 50,782,208 B だった。全 DB の和でも 15,605,760 B（論理容量の 31%）足りない。`databaseBytes` と `allDatabasesBytes` は参考として出力に残す。
- `pg_total_relation_size` は削除済みで未回収の行（dead tuple）も含む。保存直後は詰めた後の約2倍になり得る（#574 の計測）。

### 超えたとき

監視は知らせるだけで、何も自動で実行しない（出力の `automaticAction` は常に `none`）。

- 保持期間の短縮・版の削除・全 DB の復元はしない。本人の承認なしにこれらを行う手順は、このリポジトリに無い。
- 本人へ、最新の観測・増え方・届く見込み日と、承認済みの方針（無ければ #575 の推奨案と一問）を渡して判断を仰ぐ。
- 本人の判断を待つ間も保存は止めない。Neon の上限に近づいた場合の扱い（上限を上げる・プランを変える）も本人の判断。

### 始める・止める

監視は読み取りだけの単発コマンドで、常駐しない。止めるときは実行をやめるだけで、保存・履歴・権限には何も残らない。
本番の定期実行には、読取専用の role（SELECT だけ、`default_transaction_read_only=on`）と 監視専用の Neon API キー（branch の `logical_size` を読むだけに使う）を本人の承認のうえで用意する。role・キー・定期実行・届け先はまだ無い（#590）。

全版保持に決めたので、本番の定期実行は画面を有効にする前（[document-history.md](document-history.md)「適用ゲート」の手順 4 の前）に始め、全版保持を続ける間は止めない。止まった・届かなくなったと分かったら、その日のうちに直すか、保持方針を決め直す（#575。消す・縮める方針にするなら磯貝さんの承認を近藤か芹沢を通して取る）。

届け先: （#590 で決めて書く。誰に・どの経路で・終了コード 3/4/5 と定期実行の停止がどう届くか・試しの警告を送った日と証拠）

## 回帰検証（隔離環境）

```sh
./script/verify-history-retention.sh            # dry-run（#576）
./script/verify-history-retention.sh regression # 監視と、候補を外した後の復元（#577）
```

新規のローカル cluster（TCP 無効・Unix socket のみ）だけを使い、本番・共有 DB・DATABASE_URL には接続しない。`regression` は次を確かめる。

- 合成データで保存・復元・Undo・削除・削除シートの復元を実際の関数で作り、READ ONLY の観測から監視が normal / exceeded / measurement-failed を返す。
- 段階的間引き案の候補を、この使い捨て cluster の中だけで外した後:
  - 一覧に外した版が出ない。外した版の読取と復元は `NOT_FOUND` で、シートの revision は変わらない（成功と見せない）。
  - 復元元・Undo 先として参照で残した版は読めて、復元できる。
  - 削除シートは deleted_documents の指す版が残り、復元できる。
  - 作成時の未知型ブロックは、作成版への復元で欠けずに戻る。
  - 別 owner からは一覧が空で、owner を偽った呼び出しと runtime の表の直読は拒否される。
- 候補を外す処理はこの検証スクリプトの中だけにあり、cluster を作った同じスクリプトの合成データにしか向かない。製品コード・本番用の手順に削除の経路は足していない。

画面側は `app/builder/version-history.test.tsx` の「履歴に無い版（NOT_FOUND）」で、差分の読込・復元の確認・復元の実行が NOT_FOUND のとき、成功の通知を出さず親へ復元済みと伝えないことを確かめる。

## 保持処理を将来入れるときの適用ゲート（未実装・未承認）

削除を実行する処理は今は無い。入れるなら別の作業として磯貝さんの承認（近藤か芹沢を通す）を取り、次をすべて満たしてから実行する。

1. 本人が承認した方針・対象（DB とシートの範囲）・有効期限・plan hash が記録されている（決定者・日付・証拠の欄を埋める）。
2. 実行の直前に、同じ保持案で dry-run をやり直し、plan hash が承認時と一致する。違えば中断して再承認を取る（`assertPlanReusable` が `PLAN_STALE` を返す）。
3. 対象の版ごとに sheet・revision・owner・action・参照（restored_from / restored_before・deleted_documents）を照合し、残す版の参照先が候補に入っていない。
4. 対象シートの保存・復元・削除復元と同時に動かない。シート単位の行ロック（skill_sheets の FOR UPDATE、削除シートは deleted_documents の FOR UPDATE）を取り、取れなければ待たずに中断する。
5. 1 transaction で、件数上限（承認した件数を超えたら全体を rollback）、`lock_timeout`・`statement_timeout` を付ける。失敗・切断・timeout は成功扱いせず、別接続で COMMIT 済みかを確かめてから再試行する。再試行は dry-run からやり直す。
6. 実行前に、対象行の限定バックアップ（本文を含むため私用の場所、0600、Git 対象外）を取り、新規ローカル cluster への復元で中身が一致することを確かめる。
7. 画面の文言を方針に合わせる。次の文言はどれも全版保持の前提で、保持期間を入れるなら期間を書くか、消えた版は戻せないと書く。行番号は 2026-10-21 時点。
   - `app/builder/version-history.tsx:659`「いまの内容も履歴に残ります。」
   - `app/builder/version-history.tsx:709`「いまの内容も履歴に残るので、あとから戻せます。」（あとで戻せると約束する一番強い文言）
   - `app/builder/version-history.tsx:710`「復元前の内容は履歴に残りますが、現在の入力ルールでは戻せません。」
   - `app/builder/version-history.tsx:715`「それらの変更も今の内容から消えます（履歴には残ります）。」
   - `app/builder/builder-client.tsx:881`「保存済みの内容は版の履歴に残ります。」
   - `app/builder/project-editor.tsx:398` `:414` と `app/builder/project-nav.tsx:282`「保存済みの内容は版の履歴で確認できます。」
   - 試験の期待値（`app/builder/version-history.test.tsx` の 139・206・208 行）も合わせて直す。

   直す前に次で数え直し、増えた文言も直す。2026-10-21 時点の出力は上の 8 か所と、コードのコメント（`builder-client.tsx:723`）の 9 行。`history-drawer.tsx:82`「最新 N 件まで残ります」はブラウザ内の入力履歴で、版の履歴ではないので対象外。

   ```sh
   grep -rnE '履歴に残|履歴には残|版の履歴で確認|あとから戻せ' app src --include='*.tsx' --include='*.ts' | grep -v '\.test\.'
   ```
8. 実行後に監視の観測を取り、件数と容量を記録する。削除しても物理容量は VACUUM まで減らず、Neon の論理容量がいつ減るかは保証しない。

## 戻し方（コード・transaction・バックアップは別物）

| 何を戻すか | 方法 | 戻らないもの |
| --- | --- | --- |
| 監視・dry-run のコード | revert するか実行をやめる。データには触れていない | なし |
| 将来の削除処理の transaction | COMMIT 前の失敗は rollback で全部戻る | COMMIT 後の削除。コードを止めても消えた版は戻らない |
| 消えた版 | Neon の復旧地点（PITR）か、実行前に取った限定バックアップから、別 branch・別 cluster へ復元し、該当の版だけを戻す | Neon の復旧期間（`history_retention_seconds` = 21,600 秒 = 6 時間、2026-10-21 に読取）を過ぎた削除は PITR では戻らない。限定バックアップを取っていなければ戻せない |

- 全 DB を古い時点へ戻さない。後から行った編集・認証の更新まで消える。戻すのは対象の版だけにし、今の revision を照合してから入れる。
- 消えた版を戻しても、その間の一覧・Undo の表示は戻らない。戻した区間を記録する。
- 容量が足りないことを理由に、承認なく版を消したり、全 DB を戻したりしない。

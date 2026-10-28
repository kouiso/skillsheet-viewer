# 共通D1への移送契約と切替・復旧ゲート（#598）

Vercelは残す。Vercelサーバー→用途限定Worker API→D1、およびWorkers→同じD1という訂正後の要求を使う。別DBへの複製を通常運用にせず、旧Neonへのfallbackを残さない。この文書とオフライン検証コードは切替準備であり、本番切替・本番棚卸しの実施記録ではない。

## 別担当へ渡すデータ契約

実装は `script/d1-migration-codec.ts` の `MigrationKind` / `MigrationColumn` / `MigrationTable` / `MigrationRow` / `MigrationExportRow`、`encodeMigrationRow()`、`decodeMigrationRow()`、`compareMigrationTable()` と、`script/d1-migration-snapshot.ts` の `MigrationOrigin` / `MigrationLedger` / `MigrationSnapshot` / `compareMigrationSnapshot()`。具体的な生入力は `script/fixture/d1-migration.json` にある。値の型・未対応値の拒否条件は [codecの契約](d1-migration-codec.md) にまとめた。

`MigrationColumn` は `{name, kind, nullable}`、`MigrationTable` は `{name, columns, primaryKey}`。`name` は元schema付きの識別子。`primaryKey` は照合上の一意な行キーであり、元DBのPRIMARY KEY制約が存在すると推測するものではない。例えば `document_versions` は `(sheet_id, revision)` のunique制約を照合キーに使う。

| 元の列・型 | exportで渡す型 | 提案するD1格納型と注意 |
| --- | --- | --- |
| UUID全列、UUID外部キー | string | TEXT、小文字。IDを再発行しない |
| `skill_sheets.revision`、`document_versions.revision/restored_from/restored_before`、`deleted_documents.revision` | 非負signed64bit範囲の10進string | TEXT。nullable参照はNULLのまま。Number化・辞書順の版ソート・SQLite数値castでのCASをしない |
| `document_versions.transaction_id`、`drizzle.__drizzle_migrations.created_at` | signed64bitの10進string | TEXT。後者は日時codecを使わず、旧migrationの来歴として保持 |
| `blocks.order` 等のPostgres integer | signed32bitのnumber | INTEGER。順序重複と欠番は別の整合性検査で確認 |
| 全timestamptz列 | offset付き生string、端数は最大6桁 | UTCの固定6桁小数秒TEXT。driverのDate化より前に取得する |
| `blocks.data`、`document_versions.blocks`、OAuth系metadata/custom_claims/confirmation等のjsonb | 生JSONのstring | TEXT。巨大数値を丸めず正規化し、未知フィールドも残す。アプリのJSON.parseとは別契約 |
| `skillsheet_state.deleted_sheet_ids` | 1次元UUID配列をJSON化したstring | JSON配列TEXT。削除復元後も残る再送防止台帳。`deleted_documents`へ集約しない |
| OAuth系scopes/contacts/redirect_uris/resources等のtext[] | 1次元配列をJSON化したstring | JSON配列TEXT。NULL/空配列/NULL要素/順序/重複を区別 |
| boolean全列 | boolean、nullableならnull | INTEGER 0/1またはNULL。未設定をfalseに変換しない |
| それ以外のtext/name列 | string、nullableならnull | TEXT。秘密値を含む列も名前や値を変更せず、ログには出さない |

これはD1のCREATE TABLEを生成・適用する契約ではない。SQLite側の制約、日時・配列のアプリadapter、revision比較、Better Auth adapter、履歴の原子的保存はアプリ/DB担当で実装・統合する。

現在のコードから棚卸しの候補となるpublic表は `skill_sheets`、`skillsheet_state`、`blocks`、`document_versions`、`deleted_documents`、`real_volume_demo_fixtures`、`viewer_login_attempt`、`drive_destination`、`user`、`session`、`account`、`verification`、`jwks`、`oauth_client`、`oauth_resource`、`oauth_client_resource`、`oauth_refresh_token`、`oauth_access_token`、`oauth_consent`、`oauth_client_assertion`。さらに `skillsheet_private.principals(login_name, owner_id)` と `drizzle.__drizzle_migrations(id, hash, created_at)` を別schemaとして追う。これは実DBに存在する表の一覧ではない。未導入表、旧branchにしかない表、view/function/trigger/role/外部保存物を別途実測して台帳へ加える。

## snapshotと分離保全

`MigrationOrigin={project,database,branch,snapshot}` は移行元の固定来歴。移行先/保全先snapshotの `origin` もこの元来歴を持つ。保存先自体の物理的なDB IDやartifactの在処・暗号化・復元確認は別の非公開台帳で管理する。別branchは別ledgerとし、本番の行へ混ぜない。

`MigrationLedger={origin,tables:[{table, disposition:'migrate'|'preserve', state:'present'|'not-installed'}]}`。各 `MigrationSnapshot` は同じoriginと、`{name,state:'present',rows}` または `{name,state:'not-installed'}` の全一覧を持つ。`present` の空配列は空表で、`not-installed`とは異なる。targetがschema作成で空表を増やす場合も、未導入を空表へ黙って読み替えず、別のschema適用証跡/対応表が必要。

`compareMigrationSnapshot(ledger, postgres, migrated, preserved)` は原本全表、移行対象全表、分離保全対象全表を厳密に照合する。`migrated.rows` はD1形式、`preserved.rows` はPG exportと同じ生形式。preserve指定だけでコピーを省略すると拒否する。表/列/主キーの欠落・余分・重複・来歴違いを拒否し、全行差分があれば `matches:false` を返す。表名/来歴/行/PKを診断出力へ含めず、件数とchecksumを返す。`tables` の集計配列は入力ledger順、`ledgerChecksum` は一覧順に依存しない。出力checksumも本番由来なら公開しない。

台帳自体に存在しないDB/表は、この関数だけでは発見できない。実棚卸しの全一覧とledgerの突合、およびコピーの永続保管・復元試験を別ゲートにする。「比較関数がtrue」を「全データ移行済み」の代用にしない。

複数DB/branchの上位台帳と秘密列分類は[全体台帳の契約](d1-migration-estate.md)を使う。共有された実メタデータはmainの3DB・project全体の10branchを含むが、全ID/DB/表一覧は未確定。合成fixtureの列挙や単一neondbの固定表集合を実棚卸し完了の代用にしない。

## 最小の切替順序（まだ実行しない）

1. 全DB/branch/外部保存物の棚卸しを確定する。全版保持のD1容量・最大行・bind/SQL制限を実量と照合し、利用プランと保全先を決める。各対象を移行/分離保全/明示合意済みの扱いにする。
2. 両配信先に対応するアプリ、D1スキーマ、用途限定API、サービス認証と利用者認可、全writerの接続先固定を合成データで検証する。D1 bindingをVercelに要求せず、ブラウザへcredentialを渡さない。API/schemaバージョンと同じD1識別子を両配信先の非公開設定証跡で突き合わせる。
3. export→変換→import→全件照合→一覧/保存/削除/全版復元/CAS/owner分離のリハーサルを隔離環境で通す。再実行で行・版・削除台帳が増減しないことを確認する。現行Vercel URL、OAuth issuer/audience、両originの認証・出力・Drive・MCPを維持する。
4. 切替窓で **編集画面、MCP/OAuth・認証の書込、seed/管理script、rate limit・設定更新、定期処理を含む全writer** を停止/隔離する。停止確認後の一貫snapshotを固定し、差分同期を使うなら取りこぼしゼロの証跡を別途要求する。
5. 固定snapshotを移送・分離保全し、件数・PK・NULL・μs・JSON/配列・64bit・全行checksum、外部キー/unique/check、既定/順序、owner、全履歴/復元参照/tombstoneを再照合する。一つでも未確認なら両配信先の通常書込を開けない。
6. 両配信先を同じD1へ揃え、Neonへの全接続・書込・fallbackを遮断してから通常書込を再開する。両画面の交互/同時保存で反映、CAS競合拒否、認可拒否、削除再送防止、全版復元を確認する。監視/バックアップ/復元と両deployのsmokeを確認して移行可否を判断する。

停止時間短縮のため、schema/アプリの配備と合成リハーサルは切替窓前に済ませる。ただし今回の作業では外部環境の作成・設定・deploy自体を行わない。

## rollbackの停止条件と復旧順序

- **D1への通常書込を一度も開けていない場合**: 書込停止を維持して照合失敗を修正する。旧アプリを戻すときも、DB設定が暗黙にNeonへ戻らないことを確認する。
- **アプリだけを戻す場合**: 互換性を検証済みの旧artifactへ片側ずつ戻し、DB/API接続は共通D1へ固定する。旧artifactがD1/API契約に非互換なら、そのartifactをrollback先にしない。Vercelは削除しない。
- **D1の書込開始後にDBもNeonへ戻す場合**: 全writerを再停止し、D1の新たな一貫snapshotを保全する。切替後の新規文書・編集・認証/JWKS/OAuth・設定・削除/全版履歴/tombstoneを含む逆移送を隔離コピーで実施し、D1の現在値と復旧候補Neonを全件照合する。旧snapshotをそのまま戻すことはデータ欠損になるため行わない。逆変換の行codecは `decodeMigrationRow()` とSQLite往復fixtureで検証するが、逆export/importの実行ツールと復旧試験は未実装であり、このゲートはまだ開けない。
- 書込のタイムアウト/応答喪失は「保存されなかった」証拠ではない。CAS/操作IDで実状態を照会するまで同じ保存を自動再送しない。復旧は片側の配信先だけ先に別DBへ向けず、両配信先の唯一の正本を揃えてから再開する。

復旧後も旧Neonと全branchの保全物を削除しない。全版保持を縮める判断は移行・rollbackに含めず、既存の承認ゲートを引き継ぐ。

## 別承認が必要な操作

| ゲート | 承認対象 | 純粋なコード作業として先行できること |
| --- | --- | --- |
| 認証・権限 | サービスcredential/秘密値の作成・保存・移送、Cloudflare/Neon権限、両origin/callback/cookie設定 | 注入可能な接続境界、認可拒否・owner分離のfixture試験、設定契約のレビュー |
| 外部環境・費用 | D1/Workers等の作成・設定変更、追加プラン/契約、本番deploy | スキーマ/adapter、容量評価コード、runtime互換性のオフライン検査 |
| データ・切替 | 本番snapshot取得・秘密データの移送、全writer停止、実DB取込/切替/逆移送 | 変換・台帳完全性・checksum検証、合成リハーサル、失敗注入、復旧手順の検証 |
| 廃止・不可逆操作 | データ削除、履歴短縮、Neon廃止/解約、復旧窓終了 | 保全対象の一覧、復元可能性の検証コードと判断資料 |

通常branch pushも、依頼されたrepo必須検査が通るまでは行わない。CI明示起動、merge、force push、保護branch push、フック回避は今回の権限に含まれない。

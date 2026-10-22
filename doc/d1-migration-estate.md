# 全branch・全DBの保全台帳（#598、オフライン実装）

## 引き継いだ実環境メタデータと未確定範囲

2026-10-22に親タスクから共有された読取棚卸しの結果。今回のコード担当は実DBへ接続せず、値の読取・export・秘密移送も行っていない。次の件数や一部の名前だけで全表の実棚卸しが完成したとは扱わない。

| 範囲 | 共有された観測 | 未確定・扱い |
| --- | --- | --- |
| Neon project | `cool-boat-26004396` | このproject以外を自動探索・採用しない |
| main branch | `br-empty-forest-aqe1538i` | 他branchと行を混ぜない |
| main内のDB | `neondb`、`devin_repro_e2e`、`skillsheet_e2e`の3個 | 本番対象はmain/neondb。別E2E DBを本番へ統合しない |
| project全体 | 10branch: main 1、ready検証 1、archived 8 | main以外の正確なbranch IDと各branch内のDB一覧はこの担当に未共有。mainの3DBが全branchにも存在するとは推測しない |
| main/neondb | 19表。`skillsheet_private.principals`、`drizzle.__drizzle_migrations`を含む | 全19表の名前・列・制約の一覧は未確定。コードのpublic20表候補から19表を逆算しない |
| E2E DB | `document_versions`、`deleted_documents`が存在し、`skillsheet_e2e`には`drive_destination`も存在 | DBごとに表集合が異なる。他DBの存在で補完しない |
| D1 | skillsheet用DBはまだ存在しないとの共有 | 作成・設定・存在照会は未実行。無関係の`adult-ai-db`に触れない |

この情報から実行可能な完全台帳を生成していない。不明箇所は`enumeration:'incomplete'`のままで、検証関数は拒否する。実棚卸しにはview/function/trigger/role/外部保存物、DB型・制約からcodecへの対応、個別保全先の暗号化・権限・復元確認も別途必要。

## 実装したメタデータ契約

`script/d1-migration-estate.ts` の `validateMigrationEstate(inventory, plans)` は接続・SQL・ファイル保存を行わない。

- `MigrationEstateInventory`: `evidence:'synthetic'|'metadata-observation'`、`project`、`enumeration`、`expectedBranchCount`、`production:{branch,database}`、`branches`。branchごとに`id/role/enumeration/expectedDatabaseCount/databases`、DBごとに`name/snapshot/enumeration/expectedTableCount/tables`を持つ。
- `tables`の各要素は`{table:MigrationTable, expectedColumnCount, classifications:[{column,handling}]}`。`handling`は`ordinary/secret/review-required`。与えられたinventory内の全表をschema付きで列挙し、全列をちょうど1回分類する。独立した観測件数、名前集合、型・NULL性・照合キー、重複、未分類・余分な列を検査する。観測件数とinventoryを両方書き換えた場合の真偽は外部根拠との照合が必要で、このコードだけでは保証しない。
- `MigrationEstatePlan`: `{ledger:MigrationLedger,d1Namespace:string|null,preservationNamespace:string}`。`ledger.origin`は既存の`{project,branch,database,snapshot}`で、複合識別子をJSON配列化して連結衝突を防ぐ。全DBにつき計画がちょうど1個必要。表ゼロと確定したDBも台帳から省略しない。
- `production`で指定したmainの1DBだけがD1配置を持つ。他DB・他branchは全表`preserve`に限定する。全保全namespaceとD1 namespaceは重複を拒否する。同じ本番D1を使うVercel/Workersは配信経路であり、DBコピーを2個作る指定にはしない。
- namespaceは成果物の論理名であり、物理D1 ID・作成済みの証拠・接続先設定ではない。出力は集計と台帳/計画checksum、および常に`transferGate:'closed'`。実棚卸しの真実性、D1の存在、コピーの永続保存、権限や移送承認を証明しない。checksumは入力の配列順も含む識別用で、内容一致の全件checksumとは別。

単一snapshotの`not-installed`は既存APIで引き続き表現できる。全体台帳の実在表一覧は`present`だけを認め、候補表の未導入を他DBの表や空表で埋めない。`approval:'approved'`等の追加入力はstrict schemaで拒否する。

## 秘密移送と継続認証の個別確認ゲート

固定で`secret`が必要な列: `public.session.token`、`public.account.access_token/refresh_token/id_token/password`、`public.verification.value/identifier`、`public.jwks.private_key`、`public.oauth_client.client_secret`、`public.oauth_refresh_token.token/rotation_replay_response`、`public.oauth_access_token.token`。`verification.identifier`はローカルOAuth SDKで認可コードの保存先でもあるため、hashでも秘密扱いとする。rotation replayの暗号文もtoken応答を含み得る。

`review-required`以上が必要な列: `oauth_client.jwks/software_statement/metadata`、`oauth_resource.custom_claims/metadata`、`oauth_client_resource.metadata`、OAuth access/refresh token表の`confirmation/authorization_code_id`、`oauth_client_assertion.id`。これらを自動で秘密なしと確定しない。固定リストは既知の最低分類であり、それ以外の列も全件明示分類・レビューが必要。表名・schemaの別名を自動解決しない。

今回のfixtureは秘密列の**名前と型だけ**を扱い、その列の実値・token・新secretを作らない。秘密移送、鍵や暗号化形式の互換性、issuer/cookie/callbackと継続認証、既存session/OAuthの有効性確認は個別確認待ち。台帳検証成功だけでこのゲートを開けない。

## 合成検証の境界

`script/fixture/d1-migration-estate.ts`は架空のproject/branch IDで10branch（main1、検証1、archive8）を構成する。mainに3種類のDB名を置き、他branchは1〜2DBに変えて計17DBを検証する。これは実環境に17DB存在するという観測ではない。表も合成の最小構造で、実neondbの19表を再現したものではない。

`compareSyntheticMigrationEstate(inventory, plans, copies)` は`evidence:'synthetic'`だけを受け付け、各DBの`{source,migrated,preserved}`を既存`compareMigrationSnapshot()`へ渡す。全DBで同じ表名/PKを使い、DB・branch別の合成値を分けて、来歴差替、コピー欠落、値だけの混合も検出する。秘密列の分類テストはメタデータのみで、行照合には渡さない。`synthetic`のラベル自体は入力者の宣言であり、任意入力が実値でないことを機械的に証明する仕組みではない。実値をこのAPIへ渡してよい権限はない。

本番移行前の切替・rollback手順と承認境界は[切替契約](d1-migration-cutover.md)を参照。全一覧・秘密移送・実D1・両配信先の統合・実移送/逆移送が未実施のため、今回の成果を全データ移行完了としない。

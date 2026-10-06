# 全文書の版履歴

この機能は文書のタイトル・全 raw ブロック・ID・順序を保存する。案件だけのブラウザー履歴とは独立している。既存版の未知型・未知プロパティ・未対応値も削除しない。導入以前に存在しなかった過去版は復元できない。

## API 契約

すべて `sheet.history` 配下の editorProcedure。閲覧者には履歴・削除シート一覧・非表示の本文を返さない。版番号は 64bit の10進文字列で、Number に変換しない。

- `list({ sheetId, beforeRevision?, limit? })`: 新しい順の VersionSummary[]。limitは1〜20、既定20。次は末尾のrevisionをbeforeRevisionに渡す。本文は含めない。
- `read({ sheetId, revision })`: DocumentSnapshot（title/blocks/revision/現行ルールによるvalidation）。未対応rawも読める。
- `previewRestore({ sheetId, targetRevision, expectedRevision })`: current/targetのsnapshot、newlyVisible（会社・案件）、visibilityUncertain、confirmation、canRestore、laterRevisionCountを返す。後続件数は実際の保存版件数で、版番号の差ではない。
- `restore({ sheetId, targetRevision, expectedRevision, confirmation })`: preview時の確認値を送る。サーバーで現版と対象版を読み直して公開範囲と確認値を再計算し、DBで再度CASする。snapshot/undoRevision/undoAvailableを返す。
- Undoは別の特権操作ではない。targetRevisionをundoRevisionにし、現在版をexpectedRevisionにしてpreviewRestore→restoreを行う。後続編集があればその変更も今の内容から消えることを警告する。
- `deletedList()`: owner内の削除シートのsheetId/revision/title/deletedAt。
- `previewDeleted({ sheetId, expectedDeletionRevision })`: target/newlyVisible/confirmation/canRestore。
- `restoreDeleted({ sheetId, expectedDeletionRevision, confirmation })`: 削除時の版番号でCASし新しいrevisionのDocumentSnapshotを返す。二重実行や古い削除確認は拒否する。

確認値は認証の代替ではない。特に `visibilityUncertain` は現在rawが編集できない場合にtrueとなるため、画面に「公開範囲を完全には比較できない」と表示する。対象版が現行ルールに合わない場合は復元を拒否する。現在版が不正でもrawの履歴保存は行い、正常版への復元はできる。不正rawへのUndoを可能とは表示しない（undoAvailable=false）。

公開範囲判定は会社hiddenと案件hiddenの両方を見る。会社が非表示のままの案件は公開扱いしない。既存の可視項目は重複警告しない。新しい会社や案件も公開増加として列挙する。本文変更そのものは比較画面で確認する。

`action` は `baseline/create/save/restore/delete/restore-deleted`。DBが確認できる操作のみを記録し、同じDBログインを使う呼出元を「Claude」と推測して表示しない。ツールからの更新も従来の保存関数を通るので版は残る。

## 原子性と保持

`document_versions` は本体へのcascade FKを持たない。シート削除でも全履歴を保持し、deleted_documentsが削除CASの版を指す。元の public.skillsheet_state.deleted_sheet_ids 列は削除復元後も残すため、旧createリクエストの再送では復活しない。

本体のBEFORE更新で変更前rawを確保し、AFTER更新とblocksのstatement-level triggerで変更後rawを記録する。同一transaction内の未確定版だけ更新でき、確定済みの同じ版の本文変更は拒否する。子ブロックの制約失敗では本体と履歴をまとめてrollbackする。ブロックごとの全文再集計を避け、複数行保存はstatement単位で集計する。

削除の版は現版+1、削除復元もその版+1となる。復元時に別のシートのblock IDと衝突すれば全体をrollbackし、他のシートから奪わない。既定シートが残っている場合は既定を変更しない。全削除後の復元なら復元シートを既定にする。復元シートのcreatedAtは復元時点となる。

自動削除はない。保存期間や利用者の明示的な永久削除は別の仕様判断が必要。履歴には非表示の個人情報も含まれるため、テーブル直読権限・viewer API・公開CI成果物・通常ログには出さない。DBバックアップにも履歴と削除ledgerを含める。

## 適用ゲート（本番未適用）

1. 管理者が対象を同定しバックアップを取得する。移行検証には隔離DBを使う。
2. Drizzle migration `0011_document_versions.sql` を適用する。
3. 既存read/write境界の導入済みDBに `script/sql/install-document-history.sql` を管理接続で適用する。既存rawがbaselineとして記録される。トリガーとbackfillは同一transaction。
4. 同定済みruntime loginへ、次の6関数のEXECUTEだけを付与する。テーブルや内部capture/history_owner関数への権限は渡さない。

```sql
GRANT EXECUTE ON FUNCTION
 skillsheet_private.history_list(uuid,text,integer,text),
 skillsheet_private.history_read(uuid,text,text),
 skillsheet_private.history_count_after(uuid,text,text,text),
 skillsheet_private.history_restore(uuid,text,text,text),
 skillsheet_private.deleted_document_list(text),
 skillsheet_private.restore_deleted_document(uuid,text,text)
TO approved_runtime_role;
```

内部capture関数群は付与しない。role名は例示であり、同定済み実名へ置換して管理者が実行する。アプリの画面を有効にする前に、実runtimeで一覧/読取/合成復元を検証する。コードだけ先に出して未導入DBを履歴対応済みと扱わない。

## ローカル検証

`script/verify-document-history.sh` は新規clusterを作り、TCP無効・0700のUnix socketに限定する。既存PG環境変数とDATABASE_URLを破棄する。PostgreSQL16以上のbinをPATHに置いて実行する。本番へは接続しない。

`script/verify-document-history-managed.sh clean` と `preserved`、`inherited` は同じ隔離方式で、NOSUPERUSER/CREATEROLE/CREATEDB/BYPASSRLSの合成管理roleを使う。migration SQL全件・旧境界・新履歴installerをこのroleで実行する。既存membershipなし／SET・INHERITがfalseの既存membershipありの両方で、成功・途中失敗・再実行失敗後の全grantorのmembership一致を検査する。writerの既存schema CREATE権限、旧5関数ACL、新10関数のowner・SECURITY DEFINER・固定search_path・PUBLIC EXECUTE拒否も検査する。runtime試験はSET SESSION AUTHORIZATIONのためだけにローカルbootstrap管理接続を使い、試験内の限定roleで権限を確認する。`inherited` はwriterが別roleを通してCREATEを持つ特殊構成で、明示ACLを追加したまま完了しないよう導入全体が拒否されることと、membership・schema ACL・履歴DDLのrollbackを確認する。Drizzle CLIの台帳処理や実Neonの管理ポリシーを検証したものではない。

実DB試験は raw保持・create再送・既存境界互換・所有者分離・直接テーブル拒否・子制約rollback・restore/Undo・削除tombstone・削除復元・BigInt・実2接続ロック待機とCAS競合を検査する。Node試験は現行validationと公開範囲確認・確認token照合・editor権限を補う。


## 導入前レビュー（2026-10-06、本番適用は未実施）

### 確認した範囲

ソース・新規隔離PostgreSQL17の試験に加え、既存ルート .env の接続先で BEGIN READ ONLY 内のカタログだけを照会し、最後は ROLLBACK した。本文・シート一覧は取得していない。.env.local は同じ接続先・roleだった。ただし、**現在の本番Vercel deploymentのDB/runtimeとの一致は未確認**である。以下は「既存設定先」の実測であり、本番runtimeの成功証明ではない。

- PostgreSQL17.11、transaction_read_only=on。migration台帳の0000〜0010のhashは今回worktreeのSQLと一致。
- skill_sheets.revision はbigint/NOT NULL。旧5境界関数は存在し、SECURITY DEFINER・固定search_pathを確認。関数定義hashを保存したが、その存在だけで今回ソースとの完全一致を証明していない。
- 履歴2テーブル・履歴関数・履歴トリガーは未導入。
- 接続roleは管理側（CREATEROLE/BYPASSRLSあり）。期待ownerへのprincipal対応は1件一致したが、境界EXECUTEは持たない。**この接続でruntimeの権限検証を代用しない**。
- 専用reader/writerはNOLOGIN、非superuser、非CREATEROLE、非BYPASSRLS。監査接続から現時点ではSET ROLE不可。ローカルの同種非superuser管理roleでは一時membership付与を検証したが、実Neonの管理roleでの導入は未実施。
- publicの新規tableのdefault ACLが存在した。観測した付与先はPUBLICでもログインroleでもなく管理権限を持つNOLOGIN role。現在接続roleを作成者とする設定ではないため、直ちにruntimeへ公開されるという根拠はない。実migration実行role・継承先・default ACLは導入直前にも確認する。

非公開証跡は .evidence/db-review/catalog-report.json。秘密URL・環境変数・実経歴本文を公開リポジトリやPRへ移さない。追加ローカルDB試験は /tmp/skillsheet-history.oWMDwG にあり、NULL安全assert、削除復元の別owner拒否・ID衝突rollback・実2接続競合拒否まで成功。一時clusterは停止済み。これらは環境固有の検証証跡であり、運用バックアップではない。

### 既存書き手との互換性

| 経路 | 根拠と制限 |
| --- | --- |
| Web/TRPC・MCP文書保存 | src/db/document-service.ts が旧replace_sheet/create_sheet/delete_sheetを使用。署名とCASは変更せず履歴triggerを同一transactionへ追加。隔離DBで旧read/write試験も成功。 |
| 承認された期間・文言更新 | script/apply-period-repair.ts、apply-narrative.ts、対応revert/runはreplace_sheet経由。proposal承認は別件であり、今回実行していない。 |
| 旧block更新 | script/block-write.ts は既に LEGACY_WRITER_DISABLED で停止。復活させない。 |
| リポジトリ外のSQL・古い常駐writer | 確定済み同revisionの本文変更は40001/REVISION_NOT_ADVANCEDで拒否。外部writerは未棚卸しなので無影響とは断定できない。 |
| 認証・閲覧制限 | 文書本体2table以外にはtriggerを付けず、認証DML権限も変更しない。実runtimeによる認証smokeは別途必要。 |

旧replace_sheetは親revisionをCAS更新してから子をdelete/insertする（script/sql/install-skillsheet-write-boundary.sql）。BEFOREで旧版を確保し、同transaction内で新版を完成させる設計はこの順序を前提とする。revision更新と子更新を別transactionに分ける独自writerやblocks.sheet_idの直接変更は互換経路ではない。

### 適用順序

以下は準備した手順であり、このレビューでは実行していない。

1. canonical deploymentを固定し、deploymentのDB endpoint/database/runtime loginと管理用direct接続の対象を非秘密fingerprintで照合する。Vercel・ジョブ・ツール・旧編集画面を含む全writerを棚卸しする。別DBだった場合は中断する。
2. 旧CASコード稼働、0010適用、専用role/principal、既定シート制約、削除tombstone列を確認する。今回installは旧境界installerの再実行を必要としない。旧installerは既存roleで停止するため、無条件に再実行しない。
3. 管理用direct接続を用意し、role membership/owner/ACL/default ACL/関数定義/trigger/migration台帳を非公開保存する。新tableがruntime/PUBLIC/不要な継承roleへ自動公開されないことを作成roleのdefault ACLまで確認する。アプリ用pooled接続をmigrationやdumpに使わない。
4. 本番相当の隔離ブランチで、実際と同じ非superuser installerとruntimeを使用し、0011→install→6関数GRANT→旧保存→履歴read/restoreを検証する。合成または非公開管理したデータを使う。新規ローカルclusterの成功をmanaged権限・容量・既存ACLの代用にしない。
5. 全writerを保守状態にし、実行中の保存transaction終了を確認する。本人承認の対象シートだけを、一貫したREAD ONLY snapshotでバックアップする。対象は本体・blocks・ownerの状態行・必要なprincipal対応行と、復元に必要なschema/旧関数定義/ACL/membershipの非秘密metadataに限定する。認証user/account/session/verification、OAuth、閲覧試行、role passwordは含めない。秘密を引数へ置かず、0700/0600・checksum・Git対象外を維持し、TCP無効の新規ローカルclusterへの復元と本文・ID・順序・revision・ACL一致を先に確認する。承認後に対象件数やrevisionが変わっていれば古いbackupを導入直前の状態と扱わない。Neonの復旧地点・保持期限や全DB復旧は、この限定バックアップとは別の未確認事項として残す。導入後の履歴backupも対象・保持方針を別途明示する。
6. 正本Drizzle経路の pnpm db:migrate で drizzle/migration/0011_document_versions.sql を適用し台帳を読み戻す。db:pushや台帳を更新しない手書きDDLで代用しない。migration後とtrigger導入前の間にwriterを再開しない。
7. psql -X -v ON_ERROR_STOP=1 相当で script/sql/install-document-history.sql を適用する。BEGIN内でtriggerとraw baselineを記録する。lock_timeout=5秒、statement_timeout=30秒の失敗を成功扱いしない。切断したら別接続でCOMMIT済みか確認してから次へ進む。
8. 同定済みruntimeへ前掲6関数のEXECUTEだけ付与する。PUBLIC/runtimeのhistorytable直接SELECT/DML禁止、内部capture呼出禁止、owner分離を実runtimeで確認する。一時membershipが残っていないことも確認する。
9. 旧保存・作成・削除・認証・閲覧を隔離環境で再確認し、新コードをpreviewへ出す。実runtimeで一覧・差分・公開範囲確認・復元・Undo・削除復元を合成データで検証し、原文・順序・ID・revisionを読み戻す。本番経歴を検証のために書き換えない。
10. 本番deployment SHAとcanonical alias一致を確認する。保守解除前に読取側履歴・公開非漏洩・既存表示を確認する。必要な本番書込みsmokeは対象と承認範囲を別途明示する。旧コード・旧編集画面が残る期間のCASと履歴記録も確認する。

installerはCREATE FUNCTION/CREATE TRIGGERを使うため、成功後の丸ごと再実行は冪等ではない。台帳・table・全trigger・owner/ACL・baselineを照合する。「既に存在する」を無視して進めない。migrationとinstallは別transactionなので、途中で止まると履歴tableだけ存在する状態になり得る。

### バックアウト

- **新コードのみの不具合**：旧CASコードへ戻し、履歴table/triggerは保全する。この組合せの旧保存成功を隔離環境で先に確認する。
- **installがCOMMIT前に失敗**：installer transactionはrollbackする。0011による空tableは残り得る。旧保存への影響を確認してからwriterを再開し、台帳と実体を不一致にして戻さない。
- **triggerによる書込み障害**：全writerと新履歴UIを止め、障害時点の本体・履歴・ACLを退避する。承認された管理transactionで今回の5triggerだけを除去する。対象は親document_history_before/after、子document_history_blocks_insert/delete/update。旧境界関数は変えず、履歴table・関数・台帳を保全する。停止区間を記録し、**記録の途切れた履歴を完全だと表示しない**。
- **本文データの復旧**：コードrollbackと分ける。全DBを古いdump/PITRへ戻すと後続編集・認証更新まで失うため、先に別ブランチへ復元する。対象の現在revision/値を照合し、今回変更した値だけをCASで戻す。履歴機能だけの障害を理由に本文を無条件復元しない。
- 再導入には、履歴停止区間の現行rawを新revisionのbaselineとして扱う移行設計が必要。確定済み同revision履歴を上書きして辻褄を合わせない。自動復旧SQLは今回提供していない。

### 未解決の導入ゲート

本番deployと管理/runtime接続の一致、実runtimeの6関数ACL、実Neon管理roleでのinstallerと正本Drizzle migration経路、本番規模のbackfill・ロック・WAL/容量、外部writer棚卸し、バックアップの実復元が未検証。

ローカルの非superuser管理roleで、旧installerはprivate schema所有者readerの権限を借りずにwriterへCREATEを付与しようとし、permission deniedで停止することを再現した。履歴installerを修正し、reader/writerのSET・INHERITをCURRENT_USER grantor限定でtransaction内だけ借り、元のADMIN・SET・INHERITを復元する。元のmembershipがない場合は今回付与したgrantorの行だけを除去し、別grantorのmembershipは変更しない。writerのschema CREATEも元の有無を保持する。最後にschemaの全grantor/grantee/権限/grant optionを導入前と比較し、一致しなければtransaction全体を拒否する。継承権限など標準境界と異なる構成で拒否された場合、権限を手作業で緩めず導入設計を再確認する。PUBLIC EXECUTEのREVOKEは新10関数だけを対象にして、旧reader所有関数のACLを変更しない。

修正後の合成管理role試験はclean・preservedとも成功し、故意の途中失敗と成功後の再実行失敗でもmembershipが残らないことを確認した。私用証跡は /tmp/skillsheet-history-managed.WZ33JM（clean）、/tmp/skillsheet-history-managed.3ss9EO（preserved）、/tmp/skillsheet-history-managed.hmwOi4（inherited拒否・rollback）、既存runtime・実2接続CASの再検証は /tmp/skillsheet-history.YsHwss。停止済みの一時clusterでの結果であり、本番の権限・台帳・負荷を代用しない。

600ms自動保存ごとに全文版が増え、自動retentionは無い。statement単位triggerは行数回の集計を減らすが、親更新・子delete/insertで同版を複数回集計するため負荷/WALはゼロではない。実規模の保存頻度とサイズで容量・遅延を測り、保持期間を判断する。bigint上限近くのrevision+1はDBが拒否してrollbackするので、上限余裕も確認する。

これらが解消するまで、本番適用準備完了・無停止互換・完全復旧可能とは扱わない。

## 追加の検証結果と残るゲート（2026-10-06）

先の「未検証」は次の範囲で更新する。本番へのDDL・GRANT・本文更新は行っていない。

| 条件 | 得られた証拠 | 残る限界 |
| --- | --- | --- |
| 管理接続の対象 | Neon primary branch の live compute と管理接続hostが一致。旧6関数の定義hashは隔離環境と全件一致。 | canonical Vercel runtimeの秘密接続値は取得できず、canonical→DB/loginの直接対応は未確定。 |
| 限定バックアップ | 承認された1シートに関する15行を同一READ ONLY snapshotで取得。新規ローカルPG17で全行の原文hash、旧6関数定義、schema/table/function ACLを照合し一致。runtime直接table拒否も確認。 | 認証payloadとrole passwordは完全除外。全DB災害復旧やPITRの証明ではない。復元clusterは停止済み。 |
| managed導入 | 空の専用Neon DBへ正本Drizzle migrationを適用し、12件の台帳hashを確認。非superuser管理接続による履歴installerと限定runtimeでCRUD、restore、Undo、CAS拒否が成功。 | production branchの権限・default ACL・全writerについて無条件に同一とは扱わない。 |
| 既存ACLと導入失敗 | 非superuser管理roleの隔離試験で、成功・途中失敗・再実行拒否後のmembershipとschema/旧関数ACLの保持を確認。継承CREATEによるACL差異は導入全体をrollback。 | 本番で既存権限を緩めて通すことは禁止。 |
| 保存負荷 | 公開合成33案件（JSON約33KB）で10連続保存、履歴10版増加、最小423ms・中央値796ms・最大/p95 2229ms。 | 少数測定であり600ms以内の保証ではない。本番約94KBや長時間負荷・retention容量は未解決。WAL観測は同一branchの他DB活動を含み得る。 |

復元済み本番限定backupへ新installerを適用する一連のdry-runは未実施である。既存の「正確な旧状態の復元」と「同じ旧境界＋新履歴のmanaged導入/CAS」を組み合わせた証拠であり、両者を一つの実行として報告しない。必要性を判断せず既存隔離試験を繰り返すこともしない。

導入直前には、私用チェックリストで固定した対象シート・owner・承認時revisionを、保存transaction終了後の同一管理transaction内で再照合する。基準revisionは承認済みbackupの実記録で固定し、導入直前値と違えば適用を中断して差分とbackupの鮮度を確認する。単に事前SELECTしただけでは同時保存を排除できない。writer停止を維持し、installerの対象table lock取得後の照合を行う。migrationとinstallerの間にもwriterを再開しない。確認用ラッパーを実行する場合、既存installerのBEGIN/COMMITをそのまま外側transactionへ入れて原子性を得たと誤認しない。

runtimeの追加権限は前掲6関数のEXECUTEだけで、旧5境界・認証権限・table直読・role membershipは変更しない。旧CASコードは同じ関数署名を使えるため、コードrollback時には履歴table/triggerを保持する。trigger障害時の5trigger除去は全writer停止と障害時点backup後の別承認操作とし、履歴の空白期間を記録する。新しい編集があれば古い15行を一括上書きして戻さない。

本番PRの最終CI・preview、canonical/runtimeの直接照合、全writerの保守とlock後revision照合、default ACL、必要負荷/保持方針が揃うまで導入を実行しない。履歴機能のDDL導入は依頼済み実装の範囲内であり、追加の承認待ちを設けない。経歴文言の変更に必要な本人確認と、DDL導入前の検証ゲートは分けて扱う。

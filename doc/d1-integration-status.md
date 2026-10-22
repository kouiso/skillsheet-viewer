# #598 統合前の要求照合（2026-10-22）

これはアプリ基盤への要求の照合記録。経歴本文・実データを変更するものではない。

## 参照と保全

- [Issue #598](https://github.com/kouiso/skillsheet-viewer/issues/598) の本文は、親の接続済みGitHub読取結果として2026-10-22に共有された。Cloud環境自身のForbiddenは再試行していない。以前の成果にある「本文未取得」は、その成果時点の履歴として残す。
- アプリ成果 `94f4859` / `def0e5f` は元のbranchに保持。統合branchは `integration/598-d1-node24`。
- Node担当の原patchは4660 bytes、SHA-256 `858f660b288e77c16886f58c344845f8f7e7ff553eeb11569b74f922770ede70` を照合してから適用した。受領元commitは `65b99e0b5ba501fb43e85cea22f1d5c87bd5fbcc`。そのcommitを取得・cherry-pickしたとは扱わない。
- 最新mainの読取は `0939f6be7b49ef532ac84f893b951751289659b9`。アプリ成果の元と同じであり、今回のpatchはcontext変更なしで適用できた。
- package.jsonはengines/Voltaだけを変更し、pnpm 10.33.0、全scripts、OpenNext 1.20.10を含む全依存を保持する。既存CIのNode版だけを同期し、新しいworkflow・trigger・手動CI実行は追加しない。
- 移行13ファイルの実体は未受領。統合・内容照合・検証済みとは扱わない。

## 要求ごとの到達点

| #598の要求 | 現在のアプリ成果 | 未達・統合後の確認 |
| --- | --- | --- |
| Vercelを残しWorkersにもUIを提供 | Vercel buildを保持し、OpenNext用config/scriptsを追加 | IBM Plexの取得失敗でUI bundle未生成。WorkersでSSR/RSC、server actions、route handlers、PC/390px描画を未確認。vinextとの実ランタイム比較も未完了 |
| 同じ一つのD1正本 | 両アプリoriginから同じWorker業務APIへ接続する構成。ローカルD1でread/write、Next API/MCP往復を検証 | 本番D1は未設定。実Vercel/Workers交互・同時操作のlive E2Eは未実施 |
| Vercelから安全な接続 | サーバー専用client、サービス認証＋利用者認可、固定owner、strict DTO。ブラウザーへD1/アカウント管理credentialを渡さない | サービス資格情報と必要ならAccess policyの実作成・登録は個別ゲート。REST管理APIを通常経路には使わない |
| PG固有文書境界と原子性 | 既存private functionとの対応を文書化。D1 batchでCAS・子交換・履歴・削除・既定昇格を全rollback。未知SQL/owner偽装拒否を合成試験 | 全移送データのconstraint/参照照合と両deploymentでの並行保存は未検証 |
| 全版・削除済み文書を保持 | 全版capture/restore、確認値、tombstone、操作ごとの負64bit TEXT識別を実装 | 移行/逆移送がregistryを保持するか13ファイル受領後に照合。全履歴を共通の-1にする旧案は採用しない |
| 認証/OAuth/MCP・既存origin維持 | cookieとJWTを共有D1で再照合。issuer/audience固定、scope、session失効、JWT/family失効、DPoP再送拒否を合成試験 | 異なるhostのcookie自動共有はしない。実key/session/grant継続、既存callback/CSRF/Drive設定は未確認。sid無し旧JWTは拒否するため実契約の照合が必要 |
| CIMDのSSRF防御 | Workersの未実装DNSをplain fetchで代替せず、固定Node境界で公式DNS pinningを維持。conditional cache/304も保持 | 合成transportとprivate IP拒否まで。実公開metadata hostへの取得・認可往復は未実施 |
| JSON/配列/64bit/日時を保存 | revisionはdecimal TEXT、日時UTC小数6桁、JSONはタグ付きraw DTO。SQL NULL/JSON nullを区別。原文は丸めない | BA意味値viewで表現不能な数値を持つmetadataは拒否する。実値を読まず全データとの互換完了は判断できない |
| PDF/XLSX/DOCX・Drive | 既存サービス/出力経路を維持。D1経路のDrive owner境界と合成CRUDを検証。既存PDF単体検査は成功済み | Workers UIでのPDFフォント・画像、WorkersサーバーでXLSX/DOCX、実Drive認可/保存は未検証 |
| 静的資材・Sentry/PostHog | 既存font/image/telemetry設定を保持 | Workers UIでの資材配信と監視の実接続・通知は未確認。合成検証から実監視先へイベントを送らない |
| 全データ・全branch/DB保全 | 親から共有された3DB/10branchesを分離して扱う方針。実本番sourceは推測しない | 全表・view/function/trigger・外部保存物の台帳、checksum/全行・snapshot照合は移行側と統合待ち |
| D1上限・費用・全版保持 | SQLは固定の業務操作。Gateway入力は1MiBに制限 | 実容量/最大文書/全版増加量/利用プラン未確定。履歴は全文JSONセルを使うためD1の2MB行上限との適合を別途評価。費用・bind/SQL/読書込予算の最終評価は未完了 |
| 切替・全writer停止・逆同期 | backend誤設定やD1障害からNeonへ自動fallbackしない | 認証・MCP・定期処理を含むfreeze、切替直前照合、切替後データを失わない逆同期/復旧は未リハーサル |
| 独立rollback・API/schema整合 | `/v1/operation` の限定契約を実装 | deployment間のschema互換ゲート/health/routing/rollback pipelineは未整備。旧deployを戻すとNeonへ書ける状態を残してよいとは判断しない |
| #590監視・二重運用・Neon保全 | Neon削除・解約は実施しない | D1容量/失敗/停止監視、backup/restore、両deployment定期検査・通知は未実装/未確認。#590/#593/#331は完了扱いにしない |
| 全検査とCI緑 | ローカル合成検査の結果は個別に記録 | 本番build・Workers UI E2E・対象commitのCI緑は未達。Node24の今回の対象検査を全移行の最終検証とは扱わない |

## 移行13ファイルと照合する契約

1. schema付き元表名からD1物理名への明示マッピング。未導入表と空表を分け、本番source branch/databaseを同定する。
2. revision/restored参照は非負signed64bitのdecimal TEXT。transaction_idは符号付きTEXTであり、D1新規操作の負値を保持する。Numberに変換しない。
3. `d1_transactions(id,transaction_id)` は操作識別の永続保全表。`d1_operation_guard(id)` は通常空。他に `d1_oauth_revocation(token_hash,revoked_at)`、`d1_oauth_family(client_id,user_id,revoked_through)`、`d1_dpop_replay(key,expires_at)` を追加runtime表として台帳化する。失効状態・操作registryをrollbackで落とさない。
4. SQL NULL/JSON null/false/空配列をraw DTOで区別する。BA APIの明示nullによるclearは既存PG同様SQL NULL。全行逆移送にBAの意味値viewを使わない。
5. UTC小数6桁、UUID/外部キー、配列の順序・重複・NULL要素、未知JSON・巨大数値を保持する。アプリのeditable validationを全raw移送の変換器にしない。

秘密列の移送・既存認証継続、追加契約、cloud設定、deploy、本番切替・Neon廃止は未実施であり、今回のissue本文共有もその許可にはしない。

## 今回のNode24対象検査

Node 24.22.1 / pnpm 10.33.0、umask 077で実行。初回installは既存storeと異なる既定パスのため非TTY確認で停止したが、既存 `/tmp/skillsheet-pnpm-store` を明示すると `--frozen-lockfile --config.engine-strict=true` で成功した。lockfileのGit blobは前後とも `3b192520895c780648ea9b9a3f968d281cd34b77`。依存の追加更新や承認外build scriptの許可はしていない。

| 対象 | 結果 |
| --- | --- |
| lint / type-check | exit 0 |
| D1・OAuth/MCP・共有サービス・journalの13ファイル | 162成功、既存1skip |
| Builder・auth gateの2ファイル | 65成功 |
| 実Next dev API→Worker→ローカルD1/MCP | Node v24.22.1で9項目成功、実データ/実credentialなし |
| Worker deploy dry-run | exit 0、実deployなし |
| OpenNext CLI | Node24でhelp起動成功。UI build成功を意味しない |

今回の対象検査は227成功。移行13ファイル受領後の全3設定・build・最終統合検証とは分ける。既知のIBM Plex取得失敗は解決したと扱わず、今回は同じbuild通信を繰り返していない。ログは `.evidence/node24-integration/` に保存する。push・PR作成・CI起動は行わない。

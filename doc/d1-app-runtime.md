# D1共通アプリ接続の検証実装（#598、本番未切替）

この変更はアプリの接続境界・文書ストア・認証プロキシを対象とする。データ移送スクリプト・変換ライブラリ・本番設定は変更しない。起点は main `0939f6be7b49ef532ac84f893b951751289659b9`。現行は Prisma ではなく Drizzle + Neon Postgres。

## 状態と残るブロッカー

Next.js の実 API → Worker HTTP → ローカル workerd D1 の往復は合成アカウントで検証済み。Next からの保存を Worker 側で読み、Worker 経由の更新を Next の builderState / viewer API から即時に読める。実 Vercel / Cloudflare への deploy は実施していない。

**アプリ全体の移行完了ではない。** 次を残す。

- この環境の npm 取得で公式 `@opennext/cloudflare` が404となった。別配布元への迂回はしていない。Next.js UIをWorkersで動かすアダプター設定・ビルド・画面検証は未実施。`worker/d1-api.ts` は共通DB APIを実行するWorkerであり、Next.js UI全体のWorkerではない。
- D1上のMCP OAuth / CIMD Node transportの互換性は未検証。Next側 `getAuth()` はD1選択時にNeonへfallbackせず例外となり、Worker側は `MCP_ENABLED=true` を503で拒否する。これを既存MCPの互換完了とは扱わない。既存grantやJWKSは移送・保全対象だが、この実装は新規grantや実署名鍵を作らない。MCPを使う本番へのD1切替は、このままでは不可。
- `pnpm build` は既存 `next/font/google` の IBM Plex Sans JP / IBM Plex Mono の取得失敗で exit 1。フォントや通信経路を変更してゲートを通していない。Next の検証は dev の API 経路であり、本番ビルドの成功・UI/PDFのlive E2Eを代用しない。
- #598本文は接続ツールがUnknown tool、`gh issue view 598` がGraphQL Forbiddenとなり未取得。ユーザー依頼・受領済みの移行契約・既存repoを根拠にした実装であり、Issue受入条件の完全照合は未完。
- 移行担当の9ファイルは別環境・未pushのため、このcheckoutにはない。契約文との照合と合成fixture検証であり、両ブランチの実コードを統合して通した証明ではない。
- 親担当から受領した棚卸しメタデータでは、main branch内に3DB、project全体に10branchesがあり、DBごとに表集合も異なる。main DBでは未導入の履歴表・Drive表が別E2E DBには存在する。単一DBの固定アプリ表だけを移して全データ移行完了とはしない。元来歴別の全体台帳と分離保全が必要。ここでは各実DB/branchの接続・値読取を行っていない。
- skillsheet用の実D1は未作成との共有を受けた。既存の無関係なD1へ接続・変更する処理はない。ゼロplaceholderを実DB IDと同一視しない。

## 接続と認可

`SKILLSHEET_DB_BACKEND` は未設定 / `neon` が現行互換、`d1` が検証用の新経路。不明値を拒否し、D1失敗時にNeonへfallbackしない。Vercelは `src/server/d1-runtime.ts` のサーバー専用接続からWorkerへアクセスする。ブラウザーへサービス資格情報を渡さない。

Workerは `POST /v1/operation` の固定DTOのみを受ける。SQL文字列・テーブル名・owner・role・余分な引数を拒否する。1MiBの入力上限、no-store、redirect拒否、有限timeoutを持つ。SQL実体と本文を通常ログ・エラー応答へ出さない。

必須設定は `DB` binding、`SKILLSHEET_OWNER_ID`、`D1_GATEWAY_SERVICE_TOKEN`、`BETTER_AUTH_SECRET`、`SESSION_SECRET`、`APP_ORIGINS`（認可済みアプリoriginのJSON配列）。全てserver側。repoのconfigにはDB IDのゼロplaceholderだけを置く。実secretの発行・登録はこの作業では実施していない。

サービス認証と利用者認可は別に行う。Better Auth sessionをD1から再検証し、user.idが固定ownerと一致した場合だけeditorとする。閲覧cookieは既存HMAC形式を検証する。viewerはread/listのみで、会社hiddenと案件hiddenの両方をWorker内で除去してから返す。履歴・削除一覧・Drive・文書更新はeditorのみ。ownerはbody/headerの自己申告から決めない。

`viewer.reserve/check/clear/purge` だけは閲覧コード照合前に必要なため、サービス認証のみで実行する。利用者の現在時刻を受けずWorker clockを使う。DB側の原子的試行枠消費は両アプリで共有する。元からあるプロセス内制限とDB不通時の劣化通知は残す。Worker上で信頼プロキシが確定しない送り元は従来のunknownキーに保守的にまとめる。

`/api/auth/*` は固定gatewayへproxyし、APP_ORIGINSで選んだアプリoriginをBetter AuthのbaseURLにする。利用者のOriginは書き換えずCSRF検査へ渡す。public signupは無効。Node fetchが伸長した認証応答はencoding/lengthヘッダーを除いて再配信し、session cookieを保持する。

## 文書DTOと原子性

公開契約は `src/db/document-operation.ts`、入力allowlistは `src/db/d1/contract.ts`。既存 `DocumentRead` / `DocumentSnapshot` / `DocumentSummary` と `createDocumentHistory` のvalidation・確認値・エラー契約を再利用する。既存Postgres用SQLと型の経路も保持する。

文書read/list/create/replace/deleteと履歴のlist/read/countAfter/restore/deletedList/restoreDeletedだけを扱う。gateway上のrestoreにはconfirmationが必須で、共有historyサービスが公開増加を読み直して再検証する。primitiveな復元SQLを直接公開しない。

[D1 batchのtransaction保証](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch)の中で、CAS成功フラグ・旧版capture・親更新・blocks交換・新履歴・応答snapshot・フラグ消去を実行する。失敗は全rollback。CAS敗者の後続DELETEも必ずフラグで条件付ける。既定削除時の昇格候補はidとrevisionを同じbatchで再確認する。

全版保持、削除tombstone、削除復元、既定昇格時の版増分、同内容create再送を維持。既存履歴と同revisionのowner/title/JSONが違えば制約違反で全rollback。JSON比較の数値はraw tokenを使い、巨大数値を浮動小数点へ丸めて同一と判定しない。未知rawはSQLで履歴へ退避し、現行validationが扱えない文書の編集は拒否する。

通信失敗したmutationは自動再送しない。replaceだけは結果不明時に同IDを読戻し、expectedRevision+1とタイトル・全文一致を確認できた場合に成功を返す。CONFLICTなどの明示拒否を読戻しで成功へ置き換えない。他のmutationの結果不明は利用者側で最新状態を確認する必要がある。

Vercel/Workersの別cacheは相互失効しないため、D1経路のDB正本readは `unstable_cache` を通さない。request cookieはcache内部で読まない。Neon経路は従来のcacheを保つ。

## 移行担当との格納契約

`src/db/d1/schema.sql` はアプリの格納契約とローカル試験用DDL。移送処理・本番用の自動migrationではない。表を消すSQLは含めない。

| 対象 | D1 runtimeが必要とする契約 |
| --- | --- |
| 公開schemaのアプリ表 | 元の `public.<name>` をD1の裸の `<name>` へ明示的に対応付ける。IDと列名は現行維持 |
| revision / restored_from / restored_before | 正規化した非負signed64bitの10進TEXT。CASはTEXT等価比較、増分はJS BigInt→TEXT。NumberやSQLite数値castをCASに使わない |
| 履歴順・before・countAfter | 桁数を先に比較し、同じ桁数だけBINARYな10進文字列を比較する。単純な辞書順ソートはしない |
| transaction_id | 既存値はsigned64bitの10進TEXTのまま保全。D1で新規記録する版は `-1` を「Postgres xidなし」のsentinelにする。runtimeの操作UUIDとは別物 |
| UTC日時 | TEXT、小数秒6桁。新規runtime値の下3桁は000。更新対象でない既存createdAt等は書き換えない |
| UUID | TEXT・小文字。ID再発行なし |
| data / blocks / nullable JSON | JSON TEXT。SQL NULLとJSON `null`は別。未知rawと巨大数値はSQLで保存・baseline captureし、未知値をUIで編集可能に丸めない |
| 配列 | JSON TEXT。順序・重複・NULL要素を保持。deleted_sheet_idsをdeleted_documentsへ集約しない |
| boolean | INTEGER 0/1、nullableはNULL |
| orderなど | INTEGER。入力validationは既存の連番・一意ID条件を使う |
| d1_operation_guard | 新しいruntime内部表。通常は空。元DBの棚卸しに存在した表と混同せず、移行台帳で追加の空表として明示する必要がある |

`drizzle.__drizzle_migrations` や `skillsheet_private.principals` 等は、このruntimeのアクティブ表へ暗黙変換しない。旧migrationのcreated_at bigintも日時へ変換しない。別の保全コピー・逆移送台帳に全表を含める責務は移行担当側に残る。

Better AuthのDate DTOは既存と同じJS Date精度になる。DBの既存6桁日時は更新対象でない限り保持する。OAuthのnullable metadata/custom_claims等について、DrizzleのJSONモードはSQL NULLとJSON nullをJSでは同じnullにする。この変更ではOAuth操作自体を有効にしていないため格納値を再保存しないが、MCP実装の前にrawを失わないadapter契約と回帰検査が必要。

秘密を含む列は、accountのaccess_token / refresh_token / id_token / password、jwks.private_key、session.token、oauth_client.client_secret、OAuth token / rotation_replay_response、verification.value等。schemaに列型を定義したことは、実値読取・export・移送・新secret作成の許可ではない。**秘密列の移送と既存認証の継続は個別確認が必要な別ゲート**であり、この変更ではいずれも実行していない。継続ログインの本番成功を合成ログイン試験から推定しない。

同様に、巨大JSON数値を含む未知rawのDB・baselineは精度を保持するが、従来のraw DocumentSnapshotはJSのunknownを使う。これをlosslessな移送DTOとして使ってはいけない。既存の編集validationを通らない値は書戻さず、codecによる全行照合とは区別する。

統合前に移行担当と確定すべき点は、schema付き表名の物理マッピング、追加の空guard表の台帳上の扱い、D1新規版のtransaction_id=-1の逆移送、未導入の履歴表を空扱いにせず導入ゲートに従うこと。移行担当の `script/d1-migration-*` / `doc/d1-migration-*` の9ファイルは編集していない。

## 再現と証跡

Node 22.23.4 / pnpm 10.33.0と既存の直接依存を保持し、Wrangler 4.148.0を固定追加してlockfileを更新。wrangler configは `remote:false`、ゼロID、workers_dev/preview_urls無効。types・ローカル起動・deploy dry-runで検証した。

```sh
pnpm type-check
pnpm lint
pnpm test
pnpm test:d1:app
pnpm exec wrangler deploy --dry-run --config wrangler.d1.jsonc
```

`pnpm test:d1:app` は `.env*` / `.dev.vars*` がある作業ツリーで起動しない。専用tmp配下にローカルD1と合成アカウントを作り、Next dev APIとWorkerのread/writeを確認して終了時に片付ける。本番URL/Neonは読まない。ログとJSON結果は `.evidence/d1-app/`。

最初の全体testでは画面1件が失敗したが単独再検証57件が成功。次の全体実行で画面1084件が成功し、Nodeの既存journalテストがumask077の影響で失敗した。このテストはmode0664で公開fixtureを作る前提なので、umask022でもう一度全設定を検証し、画面1084・Node946・PDF225の計2255件成功、既存8件skipでexit 0だった。結果を隠すためのskip・フック回避・テスト削除は行っていない。型検査・lint・Worker dry-run・Next API往復も成功。Workerのローカル起動profileは153.7msの計測窓、active92.0msで取得済み（Cloudflare本番の起動時間を示す値ではない）。ビルドは上記のGoogle Fonts取得失敗で未達。

## 本番切替前に必要な限定操作（ここでは未実施）

1. #598本文と両ブランチを統合してschema/codec/逆移送・欠損拒否を照合する。
2. 取得可能な公式Next.js Workers adapterをrepoで固定し、MCP OAuth/CIMDとnullable JSONの互換を完成・検証する。
3. 通信が許される環境で本番build、全test、UI/PDF live E2E、両runtimeの合成接続検査を通す。
4. 別承認の下で同定済みD1とWorkerを設定する。秘密移送・継続認証の個別ゲートを満たしてから認証の受渡しを実施する。owner・APP_ORIGINS・サービス認証の対応を確認する。新規grantを勝手に追加しない。
5. 移行担当のfreeze・backup・全表照合・rollback復元検証を実施する。両deploymentを同じD1境界へ向ける。二重writer状態やNeonへの自動fallbackを作らない。

本番設定、deploy、DB本番移行/削除、外部連絡、PR作成、CI手動起動、merge、force pushは実施していない。必須ゲート未達の状態では通常branch pushもしない。

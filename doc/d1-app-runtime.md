# D1共通アプリ接続の検証実装（#598、本番未切替）

この変更はアプリの接続境界・文書ストア・認証プロキシを対象とする。データ移送スクリプト・変換ライブラリ・本番設定は変更しない。起点は main `0939f6be7b49ef532ac84f893b951751289659b9`。現行は Prisma ではなく Drizzle + Neon Postgres。

## 状態と残るブロッカー

Next.js の実 API → Worker HTTP → ローカル workerd D1 の往復は合成アカウントで検証済み。Next からの保存を Worker 側で読み、Worker 経由の更新を Next の builderState / viewer API から即時に読める。実 Vercel / Cloudflare への deploy は実施していない。

**アプリ全体の移行完了ではない。** 次を残す。

- 公式 adapter は `@opennextjs/cloudflare@1.20.10`。以前の `@opennext/cloudflare` 404 は package 名の誤りだった。正しい公開版を取得し、Next 16.3.8 が peer 範囲 `>=15.5.27 <16 || >=16.3.8` に含まれることを確認した。最新1.20.13のNext peerは `>=15.5.28 <16 || >=16.4.1` のため採用しない。`open-next.config.ts` / `wrangler.ui.jsonc` / `build:workers` を追加した。Vercel用の既存buildは保持する。
- 通常buildとOpenNext buildは、既存 `next/font/google` の IBM Plex Mono / IBM Plex Sans JP の取得失敗で止まる。同一資材がrepoにないため無断代替しない。OpenNextによるWorkers UIのbundle・起動・画面E2Eは未実行であり、gatewayの成功をUI完了とは扱わない。
- MCP / OAuthは合成JWT・合成refresh token・ローカルD1で実装検証する。実grant・既存鍵・実sessionの移送／継続確認は別ゲート。本番sourceのVercel branch/databaseも未確定。
- #598本文はGitHub接続の読取でForbiddenとなり未取得。迂回していない。repoと親から共有された契約を根拠とし、issue本文の最終照合を残す。

## 接続と認可

`SKILLSHEET_DB_BACKEND` は未設定 / `neon` が現行互換、`d1` が検証用の新経路。不明値を拒否し、D1失敗時にNeonへfallbackしない。Vercelは `src/server/d1-runtime.ts` のサーバー専用接続からWorkerへアクセスする。ブラウザーへサービス資格情報を渡さない。

Workerは `POST /v1/operation` の固定DTOのみを受ける。SQL文字列・テーブル名・owner・role・余分な引数を拒否する。1MiBの入力上限、no-store、redirect拒否、有限timeoutを持つ。SQL実体と本文を通常ログ・エラー応答へ出さない。

必須設定は `DB` binding、`SKILLSHEET_OWNER_ID`、`D1_GATEWAY_SERVICE_TOKEN`、`BETTER_AUTH_SECRET`、`SESSION_SECRET`、`APP_ORIGINS`（認可済みアプリoriginのJSON配列）。全てserver側。repoのconfigにはDB IDのゼロplaceholderだけを置く。実secretの発行・登録はこの作業では実施していない。

サービス認証と利用者認可は別に行う。Better Auth sessionをD1から再検証し、user.idが固定ownerと一致した場合だけeditorとする。閲覧cookieは既存HMAC形式を検証する。viewerはread/listのみで、会社hiddenと案件hiddenの両方をWorker内で除去してから返す。履歴・削除一覧・Drive・文書更新はeditorのみ。ownerはbody/headerの自己申告から決めない。

`viewer.reserve/check/clear/purge` だけは閲覧コード照合前に必要なため、サービス認証のみで実行する。利用者の現在時刻を受けずWorker clockを使う。DB側の原子的試行枠消費は両アプリで共有する。元からあるプロセス内制限とDB不通時の劣化通知は残す。Worker上で信頼プロキシが確定しない送り元は従来のunknownキーに保守的にまとめる。

`/api/auth/*` は固定gatewayへproxyし、APP_ORIGINSで選んだアプリoriginをBetter AuthのbaseURLにする。利用者のOriginは書き換えずCSRF検査へ渡す。public signupは無効。Node fetchが伸長した認証応答はencoding/lengthヘッダーを除いて再配信し、session cookieを保持する。

## 文書DTOと原子性

公開契約は `src/db/document-operation.ts`、入力allowlistは `src/db/d1/contract.ts`。既存 `DocumentRead` / `DocumentSnapshot` / `DocumentSummary` と `createDocumentHistory` のvalidation・確認値・エラー契約を再利用する。既存Postgres用SQLと型の経路も保持する。

文書read/list/create/replace/deleteと履歴のlist/read/countAfter/restore/deletedList/restoreDeletedを扱う。gateway上のrestoreにはconfirmationが必須で、共有historyサービスが公開増加を読み直して再検証する。primitiveな復元SQLを直接公開しない。

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
| transaction_id | 既存値はsigned64bitの10進TEXTのまま保全。D1の新規操作には負のsigned64bit decimal TEXTを一意に割り当てる。操作UUIDとの対応を `d1_transactions` に永続記録する。旧PG履歴とregistryの衝突は全rollback。同batchの削除／既定昇格は同じID、別の保存は別ID。全操作の `-1` 共用は廃止 |
| UTC日時 | TEXT、小数秒6桁。新規runtime値の下3桁は000。更新対象でない既存createdAt等は書き換えない |
| UUID | TEXT・小文字。ID再発行なし |
| data / blocks / nullable JSON | JSON TEXT。SQL NULLとJSON `null`は別。未知rawと巨大数値はSQLで保存・baseline captureし、未知値をUIで編集可能に丸めない |
| 配列 | JSON TEXT。順序・重複・NULL要素を保持。deleted_sheet_idsをdeleted_documentsへ集約しない |
| boolean | INTEGER 0/1、nullableはNULL |
| orderなど | INTEGER。入力validationは既存の連番・一意ID条件を使う |
| d1_operation_guard | 新しいruntime内部表。通常は空。元DBの棚卸しに存在した表と混同せず、移行台帳で追加の空表として明示する必要がある |

`drizzle.__drizzle_migrations` や `skillsheet_private.principals` 等は、このruntimeのアクティブ表へ暗黙変換しない。旧migrationのcreated_at bigintも日時へ変換しない。別の保全コピー・逆移送台帳に全表を含める責務は移行担当側に残る。

Better AuthのDate DTOは既存と同じJS Date精度になる。DBの既存6桁日時は更新対象でない限り保持する。`readD1Json` / `writeD1Json` の保存DTOは `{kind:"sql-null"}` と `{kind:"json",text}` を区別し、JSON null／空配列／false／巨大数値／未知項目を再serializeしない。

公式Better Auth SQLite adapterはJSON/配列を自分でserialize/parseするため、Drizzle側はraw TEXTを通す。JSON modeを重ねて二重encodeしない。BAの意味値viewはSQL NULLとJSON nullをどちらもJS nullとして見るため、そのviewを全行の逆移送DTOにしてはいけない。更新は明示フィールドだけであり、未指定列のrawを再保存しない。BA APIの明示nullは現行PGと同じSQL NULLへのclearであり、literal JSON nullを保存するにはraw DTOを使う。合成DBで名前だけの更新がJSON nullを保持し、明示nullがSQL NULLになることを検査する。BAが表現不能な巨大数値・過剰な小数精度を持つJSONを読む場合は `LOSSLESS_JSON_VIEW_REQUIRED` で拒否し、rawはそのまま保持する。普通の小数0.5等は許可する。保全データを意味値へ丸めて認証を通すことはしない。この制限に当たる実metadataがあれば本番互換の追加ゲートであり、raw全行照合とは区別する。

秘密を含む列は、accountのaccess_token / refresh_token / id_token / password、jwks.private_key、session.token、oauth_client.client_secret、OAuth token / rotation_replay_response、verification.value等。schemaに列型を定義したことは、実値読取・export・移送・新secret作成の許可ではない。**秘密列の移送と既存認証の継続は個別確認が必要な別ゲート**であり、この変更ではいずれも実行していない。継続ログインの本番成功を合成ログイン試験から推定しない。

同様に、巨大JSON数値を含む未知rawのDB・baselineは精度を保持するが、従来のraw DocumentSnapshotはJSのunknownを使う。これをlosslessな移送DTOとして使ってはいけない。既存の編集validationを通らない値は書戻さず、codecによる全行照合とは区別する。

統合前に移行担当と確定すべき点は、schema付き表名の物理マッピング、追加runtime表の台帳上の扱い、D1新規版の負のtransaction_idとregistryの逆移送、未導入の履歴表を空扱いにせず導入ゲートに従うこと。移行担当の `script/d1-migration-*` / `doc/d1-migration-*` の9ファイルは編集していない。

## OAuth / MCPの共有境界

Nextの `/api/mcp` はサービス認証付きでリクエスト全体をWorkerへ転送する。Authorization／DPoP／protocol headersを保持し、APP_ORIGINSに含む元origin＋`/api/mcp`で公式 `verifyJwsAccessToken` と `enforceDpopBinding` を一度だけ実行する。業務操作ごとに同じproofを再検証しない。公開鍵だけをD1から読み、既存jwt pluginと同じ期限＋30日graceを適用する。署名・iss・aud・expとowner subを検証する。

DB Workerの `BETTER_AUTH_URL` は既存canonical issuerのorigin、`MCP_RESOURCE_URL` は既存audienceのまま固定する。各UIの `BETTER_AUTH_URL` はそのUIのoriginであり、cookieは各hostで発行する。認可済み各hostで同じD1 sessionを照合する。client存在／disabled、session存在／期限／user一致、user存在、resource存在を毎request確認する。sid無しの旧tokenは本人扱いせず拒否するため、実token契約の確認が必要。resource.disabledは公式どおり新規発行停止であり、既発行JWTの一括失効とは混同しない。

Next依存を除いた共有sheet service / tool / dispatchをWorkerでも使い、既存owner照合・read/write個別scope・validation・文書CASを保持する。write scopeがreadを包含するとは扱わない。`/.well-known/oauth-protected-resource/api/mcp` と `/.well-known/oauth-authorization-server/api/auth` も明示allowlistでproxyする。

個別JWT失効は `oauth.revoke` の限定操作で、サービス認証＋最新owner sessionが必要。viewerやMCP bearerからはこの操作を実行できない。保存するのはtoken digestだけ。署名segmentのbase64url同値表記でも失効が共有される。公式RFC7009 endpointはJWTの個別revokeを未対応として拒否するため、このowner操作と同一視しない。

refreshのrotation/replay/revokeは公式Providerを使い、D1の `d1_oauth_family` でfamily失効を補強する。refreshの前後にsession/familyを確認し、revokeと交差した発行応答を返さない。認証成功したrevoke後のfamily cutoffと全refresh/access行のrevokedを同じbatchで更新する。JWTもiatがcutoff以下なら拒否する。同じ秒に発行した新tokenも保守的に拒否されるため、再認証は次の秒以降に行う。失効済みrefreshの期限を勝手に延長しない。

WorkersのNode DNS lookupは未実装のため、公式CIMD Node transportを直接動かせない。`D1_CIMD_TRANSPORT_URL` はAPP_ORIGINS内のVercel Node `/api/d1/cimd` を明示指定する。Workerが既存サービス資格情報で限定 `metadata.fetch` を呼び、Nodeで公式のresolve-once／public IP検証／DNS pinningを実行する。GET/HEADのみ、入力8KiB、応答128KiB、timeout5秒、redirect拒否。元利用者cookie／Authorization／サービス資格情報をmetadata hostへ送らない。SQL・owner・任意headersを受けるAPIではない。実metadata hostへの通信試験はしていない。合成transportの往復と公式transportのloopback拒否を検証する。

jwt pluginの自動署名鍵作成は `EXISTING_SIGNING_KEY_REQUIRED` で止める。新しい実key・grantは作成していない。合成HTTP試験の鍵／tokenは専用tmpのローカルD1だけに置き、終了時に削除する。

追加runtime表は `d1_transactions`（操作識別の永続保全）、`d1_oauth_revocation`（個別JWT digest）、`d1_oauth_family`（family cutoff）、`d1_dpop_replay`（共有proof予約）、既存追加の `d1_operation_guard`（batch中のみ）。全て移行台帳で追加分として明示し、registry／失効状態をrollbackで失わない。移行スクリプト側には手を加えていない。

## 既存private functionとの対応

| Postgres境界 | D1境界 |
| --- | --- |
| principals / SESSION_USERによるowner照合 | 必須サービス認証＋既存session/JWT／viewer照合＋設定固定owner |
| checked_blocks | strict DTO＋同じDocumentService validation、余分なkey・不正ID／連番を拒否 |
| read_snapshot / list_sheets | 固定ownerの単一statement snapshot / list |
| create_sheet / replace_sheet | D1 batch、ID再利用拒否、TEXT revision CAS、子交換・履歴を全rollback |
| delete_sheet | tombstone・既定昇格のid/revision再確認、同じ操作識別で全rollback |
| capture_document / history_restore | 確定版の改ざん拒否、全版保全、復元確認値、負64bit操作識別 |

SQLの関数名を公開RPCとして再現せず、限定した業務DTOだけを公開する。移送用の全raw JSONをアプリのeditable DTOとして受け入れることもしない。

## 再現と証跡

Node 22.23.4 / pnpm 10.33.0、Wrangler 4.148.0、OpenNext 1.20.10。OpenNextの内部buildにもrepo版pnpmを明示する。wranglerのローカルD1はremote:false・ゼロID、workers_dev/preview_urls無効。実deploy設定を変更しない。

```sh
pnpm type-check
pnpm lint
pnpm test
pnpm test:d1:app
pnpm build
pnpm build:workers
pnpm exec wrangler deploy --dry-run --config wrangler.d1.jsonc
```

`test:d1:app` は既存.env/.dev.varsがある作業ツリーを拒否する。専用tmpに合成アカウントを作り、実Next dev API→Worker→ローカルD1で文書・認証・MCP scope・discovery・CIMD private IP拒否を確認して削除する。Next子processに親のDATABASE_URL／secret／監視設定を継承しない。起動受理だけで成功にしない。

最初のcommitの全3設定は2255件成功、既存8件skip。今回受領した2ファイルの安定化修正（自動保存timer／umask依存）を統合した。後続の全体pnpm testは画面1084／Node993／PDF225で成功し、最終修正後のNode全体再検査は1009成功・既存1skip。現行3設定の合計は2318成功・既存8skipとなる。型・lint・Next往復・Worker dry-runも成功した。最新検証は `.evidence/d1-followup/`、Next往復のJSONは `.evidence/d1-app/next-api-result.json`。buildのIBM Plex取得失敗をtest成功と混同しない。

## 本番切替前に必要な限定操作（未実施）

1. #598本文と両branchを統合。Vercelの実source branch/databaseを確定し、3DB／10branchesを混合せず台帳・全表保全・欠損拒否を照合する。
2. 同一版IBM Plexの正規資材を用意できる環境でVercel / OpenNext build、Workers UI/PDF E2E、両runtimeの合成接続検査を通す。Workers UI bundleのサイズ・起動時間・Next runtime互換は現状未測定。
3. 個別承認後、skillsheet専用D1を同定して設定する。無関係adult-ai-dbは使わない。DB WorkerとUI Worker、VercelのAPP_ORIGINS・canonical issuer/resource・Node CIMD境界を限定設定する。R2追加契約はこの構成では要求しない。
4. 秘密列移送・既存署名鍵・session/token継続の個別ゲートを満たす。実metadataの意味値互換とsidを確認する。新grantを勝手に追加しない。
5. freeze・backup・全表照合・rollback復元を検証してから同じD1へ切り替える。二重writerやNeonへの自動fallbackを作らない。新runtime表も保全／逆移送対象に含める。

本番設定、deploy、実DB読取/移行/削除、外部連絡、PR作成、CI手動起動、merge、force pushは未実施。必須build未達のため通常branch pushも行わない。

## 公式資料

- [OpenNext手動導入](https://opennext.js.org/cloudflare/get-started)
- [Cloudflare Next.js](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/)
- [Workers Node DNSの対応表](https://developers.cloudflare.com/workers/runtime-apis/nodejs/dns/)
- [D1 batchの原子性](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch)

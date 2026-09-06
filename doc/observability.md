# Observability（Sentry / PostHog）

午前2時に障害対応するための手順書。設計判断の背景は PR の説明を参照し、
ここには「どこに何が出るか」「何が出ないか」「止め方」だけを書く。

## 何のために入れたか

- **Sentry**: 本番で起きたエラーに気づく（今までは `console.error` だけで、誰も見ていなかった）。
- **PostHog**: 誰がシートを開いて、最後まで読んで、PDF を落としたかが分かる。

両方とも **無料枠の範囲内**で運用する前提。キーが1つも設定されていなければ、
ビルド・テスト・アプリの動作は一切変わらない（自動で no-op）。

## どのエラーがどこに出るか

| 場所 | 何が起きたとき | Sentry に届くか |
|---|---|---|
| `app/api/trpc/[trpc]/route.ts` の `onError` | tRPC procedure の想定外エラー | 届く（`shouldLogTRPCError` が true のコードのみ。UNAUTHORIZED/NOT_FOUND/CONFLICT は届かない） |
| `app/api/auth`・`app/api/logout`・`app/api/revalidate`（`route-error.ts`） | 同上（互換 REST アダプタ側） | 同上 |
| `instrumentation.ts` の `onRequestError` | サーバーで捕捉されなかった例外（Next.js が最後に拾う） | 届く。ただし**設定不備は届かない**（次項） |
| `app/error.tsx` | ルートセグメントの予期せぬエラー | 届く。ただし `err.digest` があるサーバー起源のエラーは `onRequestError` が既に報告済みなので二重送信しない |
| `app/global-error.tsx` | `layout.tsx` 自体が同期 throw（＝必須環境変数の欠落） | **warning レベルで届く**。固定 fingerprint で1つの Issue に集約し、同一ブラウザからは1時間に1回だけ送信する（次項） |
| `sheet-view-client.tsx` の PDF 生成失敗 | フォント取得失敗・レンダリング例外 | 届く（`feature: 'pdf-export'` タグ付き） |
| `auth-gate.ts` / `viewer-rate-limit.ts` | Better Auth セッション確認失敗・DB 経路の総当たり防御が fail open | **warning レベルで届く**（セキュリティの劣化信号。バグ報告ではない） |

## あえて報告しないもの（#157 の設定不備契約）

環境変数が1つ欠けた状態で本番にクローラが来ると、`assertServerEnv()` は
**成功するまで毎リクエスト throw し続ける**（一度成功したら以降は no-op という設計だが、
失敗はメモ化されない）。ここを無条件で Sentry に送ると、5,000 件/月の無料枠を1日で溶かす。

そのため以下は **error レベルでは送らない**:

- `src/lib/env.ts` の `assertServerEnv()` が投げる「必須のサーバー環境変数が設定されていません」
- `src/util/is-config-error.ts` の `classifyConfigError()` が判定する GitHub/DB の設定不備
  （未設定・トークン拒否・テーブル未マイグレーション・接続文字列の書式エラー）

これらは「待っても直らない」原因であり、対処は環境変数の設定であって障害対応ではない。
`app/global-error.tsx` だけが例外で、**warning レベル・固定 fingerprint** で送る
（「デプロイが壊れている」という信号であって、個々のリクエストのエラーではないため）。
固定 fingerprint は Sentry 上で1つの Issue にまとめるだけで送信自体は都度発生するため、
同一ブラウザからの再送は `localStorage` で1時間に1回へ絞っている
（直りもしない状態で毎ページロード送ると無料枠を溶かす）。

## PII が乗らないこと

- Cookie・HTTP header・query string は `beforeSend` で丸ごと落とす。
- URL・パスは実際の値ではなく `route: view-sheet` のようなルート名 enum に丸める
  （`src/lib/observability/scrub.ts` の `toRouteName`）。
- サーバー側の `console.error` は Sentry のブレッドクラムに乗らない
  （`consoleIntegration` を明示的に無効化している。ブラウザ専用の `breadcrumbsIntegration` とは別物）。
- GitHub API への送信 URL（ファイル名を含む）はサーバー側 breadcrumb を無効化して防いでいる。
- PostHog は `autocapture: false`（クリックした要素のテキスト＝経歴書の本文が送られるのを防ぐ、
  最重要設定）、セッションリプレイ OFF、`person_profiles: 'identified_only'`。

## 止め方（60秒でできること）

| やりたいこと | 手順 |
|---|---|
| Sentry だけ止める | Vercel の `NEXT_PUBLIC_SENTRY_DSN` を空にして再デプロイ |
| PostHog だけ止める | Vercel の `NEXT_PUBLIC_POSTHOG_KEY` を空にして再デプロイ |
| 両方一時停止 | Sentry / PostHog 側のプロジェクト設定で ingestion を止める（コード変更不要） |
| ローカルで確認だけしたい | `.env.local` に `NEXT_PUBLIC_OBSERVABILITY_FORCE=1` を追加。**検証後は必ず消す**（消し忘れると `pnpm test:e2e` が本番プロジェクトに書く） |

## コードでは保証できないもの（ベンダー側の設定）

- **IP マスキング（Sentry）**: Sentry 側のプロジェクト設定（Data Scrubbing）で行う。コード側は
  `dataCollection` オプションを一切書かない設計にしている（書くと逆に緩くなる罠がある）。
- **IP の破棄（PostHog）**: PostHog は既定で受信時の IP を `$ip` としてサーバー側に保存する。
  コードからは止められないので、プロジェクト設定の「Discard client IP data」を ON にする。
- **PostHog の cookie 同意**: 匿名 id を持つ first-party cookie を1つ置く。cookie ID は
  UK/EU GDPR 上「個人データ」になりうる識別子であり、同意なしに置いてよいと断定はしない。
  **対象は国内（日本）の閲覧者に限る前提**で運用する — 閲覧経路は `VIEWER_CODE` で守られ、
  コードを渡した相手だけが読める。EU/UK 圏へ共有する必要が出たら、共有する前に
  同意取得後だけ `posthog.init`/`posthog.capture` が走る同意ゲートを入れる（未実装）。
  共有先の法域はコードでは判定できないので、共有する前に人が確認する。
  `persistence: 'memory'` は識別子の保存場所を cookie からメモリに変えるだけの設定で、
  送信そのものは止まらない。同意ゲートの代替にはならない
  （`instrumentation-client.ts` の `posthog.init` オプション、1行）。
- **本番スタックトレースの関数名可読性**: Next.js 16 + Turbopack 環境で Sentry の関数名が
  難読化されたままになる既知の不具合（sentry-javascript #18248、Vercel 側の対応待ち）。
  現状はコードで閉じられない。実際に起きたエラーで確認し、読めなければ Issue の説明欄で
  「入っているが役に立たない」ことを明示する運用でしのぐ。

## 欠測（広告ブロッカー）

`us.i.posthog.com` と Sentry の ingest ドメインは主要なブロックリストに載っている。読者が
エンジニア中心なら、`sheet_viewed` / `pdf_exported` は相当な割合が届かない前提で数字を読む
（「0 件」は「誰も読んでいない」ではなく「ブロックされた」かもしれない）。
本気で数えたくなったら、Sentry は `withSentryConfig` の `tunnelRoute`、PostHog は Next の
`rewrites` で `/ingest/*` を逆プロキシする（どちらも自ドメイン経由にするだけで、送る内容は変わらない）。
未実装。まず届く数を見てから決める。

## 6つのイベント（PostHog）

`src/lib/observability/event.ts` の閉じた判別共用体がすべて。新しいイベントを足すときは
enum 以外の `string` プロパティを置かない（シート名等が書けてしまう余地を型で塞ぐ）。

| イベント | いつ | 主なプロパティ |
|---|---|---|
| `$pageview` | 自動（`capture_pageview: 'history_change'`） | なし（`$current_url`/`$pathname` は denylist で落としており、ルート enum への置き換えもしていない。ページ単位でルートを見たい場合は `sheet_viewed` 等の手動イベントの enum プロパティを使う） |
| `sheet_viewed` | シート表示コンポーネントの mount | `layout`, `source`, `blockCount` |
| `sheet_read_depth` | スクロールで 25/50/75/100% 到達 | `depthPercent`, `secondsBucket` |
| `sheet_view_toggled` | ダッシュボードのビュー切替 | `view`, `enabled` |
| `pdf_exported` | PDF ダウンロードの成功・失敗 | `result`, `durationBucket`, `reason?` |
| `viewer_auth_submitted` | `/viewer-auth` のログイン試行 | `outcome`（入力コードそのものは送らない） |

ビルダー（`/builder`）にはイベントを入れていない。利用者が1人で、その1人が
ダッシュボードを見る人だから。

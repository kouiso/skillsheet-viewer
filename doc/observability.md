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
| `app/global-error.tsx` | `layout.tsx` 自体が同期 throw（＝必須環境変数の欠落） | **warning レベルで届く**。固定 fingerprint（`config-error-boundary`）で1つの Issue に集約される |
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
`app/global-error.tsx` だけが例外で、**warning レベル・固定 fingerprint** で1回だけ知らせる
（「デプロイが壊れている」という信号であって、個々のリクエストのエラーではないため）。

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

- **IP マスキング**: Sentry 側のプロジェクト設定（Data Scrubbing）で行う。コード側は
  `dataCollection` オプションを一切書かない設計にしている（書くと逆に緩くなる罠がある）。
- **PostHog の cookie 同意**: 匿名 id を持つ first-party cookie を1つ置く。個人情報ではないが、
  同意なしに置く cookie ではあるため、必要なら `persistence: 'memory'` に切り替える
  （`instrumentation-client.ts` の `posthog.init` オプション、1行）。
- **本番スタックトレースの関数名可読性**: Next.js 16 + Turbopack 環境で Sentry の関数名が
  難読化されたままになる既知の不具合（sentry-javascript #18248、Vercel 側の対応待ち）。
  現状はコードで閉じられない。実際に起きたエラーで確認し、読めなければ Issue の説明欄で
  「入っているが役に立たない」ことを明示する運用でしのぐ。

## 6つのイベント（PostHog）

`src/lib/observability/event.ts` の閉じた判別共用体がすべて。新しいイベントを足すときは
enum 以外の `string` プロパティを置かない（シート名等が書けてしまう余地を型で塞ぐ）。

| イベント | いつ | 主なプロパティ |
|---|---|---|
| `$pageview` | 自動（`capture_pageview: 'history_change'`） | ルート enum |
| `sheet_viewed` | シート表示コンポーネントの mount | `layout`, `source`, `blockCount` |
| `sheet_read_depth` | スクロールで 25/50/75/100% 到達 | `depthPercent`, `secondsBucket` |
| `sheet_view_toggled` | ダッシュボードのビュー切替 | `view`, `enabled` |
| `pdf_exported` | PDF ダウンロードの成功・失敗 | `result`, `durationBucket`, `reason?` |
| `viewer_auth_submitted` | `/viewer-auth` のログイン試行 | `outcome`（入力コードそのものは送らない） |

ビルダー（`/builder`）にはイベントを入れていない。利用者が1人で、その1人が
ダッシュボードを見る人だから。

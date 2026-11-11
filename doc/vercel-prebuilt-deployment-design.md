# Vercel prebuilt 配信の設計台帳（Issue #606）

標準 GitHub-hosted runner（ubuntu-latest）で Next.js をビルドし、Vercel 側で再ビルドせず
`vercel build` → `vercel deploy --prebuilt` で同じ成果物を配信する設計。

**現段階は読み取り専用の計画。** 実装・workflow 有効化・credential 作成/登録・Vercel/GitHub 設定変更・
実 preview/production deploy・本番切替は、それぞれ個別の許可が出るまで行わない。

秘密値・本番経歴データはこの台帳・ログ・PR・Issue・artifact に書かない。
変数は**名前と用途だけ**を記す。確認できていないものは推測で埋めず「未確認」と書く。

---

## 1. 確認済みの現状（一次情報）

### 1.1 Vercel プロジェクト（Vercel API read で確認、2026-11-02）

| 項目 | 値（非秘密） |
| --- | --- |
| Project 名 | `skillsheet-viewer` |
| Project ID | `prj_Z0FMhFT8USOuRGtG2Fzz8LJxvWwW` |
| Team | `kouisos-projects`（`team_rWBWGQA0e6oD9KzMOIrMogLw`、hobby plan） |
| Framework preset | `nextjs` |
| Node version（project 設定） | `22.x` |
| Production ドメイン | `skill-sheet-snowy.vercel.app` |
| その他ドメイン | `skillsheet-viewer-kouisos-projects.vercel.app`、`skillsheet-viewer-git-main-kouisos-projects.vercel.app` |
| Project root | 空（リポジトリルート。doc/05-toc-and-deploy.md） |
| Git 連携 | kouiso/skillsheet-viewer と接続済み。直近 deployment の meta に `githubCommitRef`/`githubCommitSha` が入る（main push=production、branch push=preview） |
| passwordProtection / ssoProtection | 無効（API 応答で確認） |

### 1.2 GitHub 側（API read で確認、2026-11-02）

- リポジトリは public / main。実行 job は既に `ubuntu-latest`（全 workflow を確認）。
- Environment は `Production`・`Preview`・`copilot` が存在し、いずれも environment secrets は未登録。
- リポジトリ secrets（名前のみ）: `APP_ID` `APP_INSTALLATION_ID` `APP_PRIVATE_KEY` `BETTER_AUTH_SECRET` `DATABASE_URL` `E2E_DATABASE_URL` `E2E_EMAIL` `E2E_PASSWORD` `PDF_CHECK_DATABASE_URL` `REVALIDATE_SECRET` `SESSION_SECRET` `SKILLSHEET_OWNER_ID` `SLACK_BOT_TOKEN` `VIEWER_CODE` `XLSX_CHECK_DATABASE_URL`。
- リポジトリ variables（名前のみ）: `PDF_CHECK_SHEET_ID` `REVALIDATE_SECRET` `SLACK_CHANNEL_ID` `SLACK_DEVIN_USER_ID` `XLSX_CHECK_SHEET_ID`。
- `VERCEL_TOKEN`・`VERCEL_ORG_ID`・`VERCEL_PROJECT_ID` はリポジトリ secrets / variables に**存在しない**（不足。§5 参照）。

### 1.3 ワークフロー（16 本、reusable 参照先を含む）

| workflow | trigger | prebuilt 化との関係 |
| --- | --- | --- |
| CI (`ci.yml`) | pull_request / push:main / dispatch | required check 群（lint,typecheck,test,build は必須。e2e は非必須で docs-only は skip）。prebuilt の build はこの build と同一手順（`bash .github/ci/run.sh build` → `pnpm build`）に揃える |
| Deploy Smoke (`deploy-smoke.yml`) | `deployment_status`（Vercel Git 連携の production 成功時）/ dispatch | §9。Git 連携由来のイベントに依存しているため、CLI prebuilt 化で発火しなくなる可能性が設計対象 |
| CI Failure Slack Notify | workflow_run | 新 deploy workflow も監視対象に含める（実装時） |
| Devin Slack Retry / Trigger | schedule / 外部 | 無関係 |
| History Capacity Monitor | schedule | 無関係 |
| PR Labeler | pull_request_target | 無関係 |
| Merge Quality Gate | pull_request(closed) | 無関係 |
| PDF Layout Check | schedule / dispatch | 無関係（本番 DB 読み） |
| Real Data Check (main) / reusable | push:main / workflow_call | 無関係 |
| Security Audit / Security Scan / Semgrep / TruffleHog | PR / push:main / schedule | 新 workflow の secrets 参照は gitleaks/semgrep の対象になりうる（実装時に確認） |
| XLSX Format Check | 無し（reusable `real-data-check.yml@main` を呼ぶ） | 無関係 |

### 1.4 アプリ構成上の注意（コードで確認）

- Next.js 16 App Router/RSC。`app/api/*` に route handler（auth・trpc・mcp・revalidate・export-docx・export-xlsx）、`app/.well-known/[[...all]]`、root の `proxy.ts`（旧 middleware。`/view/:path*` で `x-skillsheet-pathname` を付与）がある。静的 `dist` の upload では機能を維持できず、Build Output API の functions/routing が必須。
- `next.config.ts`: Sentry sourcemap（`SENTRY_AUTH_TOKEN` 無しでは sourcemap 処理自体を停止）、`serverExternalPackages`（@react-pdf/renderer, ws, @neondatabase/serverless）、`turbopackFileSystemCacheForBuild: false`（#361 対策。prebuilt でも維持。本番 `VERCEL_FORCE_NO_BUILD_CACHE=1` の二重ガードは継続）。
- build 時に読む環境変数: `NEXT_PUBLIC_VERCEL_ENV`（observability キルスイッチ、`src/lib/observability/config.ts`）、`NEXT_PUBLIC_SENTRY_DSN` / `NEXT_PUBLIC_POSTHOG_KEY` / `NEXT_PUBLIC_POSTHOG_HOST`（クライアントバンドル埋め込み）、`SENTRY_ORG` / `SENTRY_PROJECT` / `SENTRY_AUTH_TOKEN`（sourcemap upload）、`ANALYZE`（bundle analyzer の任意スイッチ）。
- runtime で読む環境変数: `DATABASE_URL` `SESSION_SECRET` `VIEWER_CODE` `BETTER_AUTH_SECRET` `BETTER_AUTH_URL` `SKILLSHEET_OWNER_ID` `REVALIDATE_SECRET` `MCP_ENABLED` `MCP_RESOURCE_URL` `APP_ENV` `TRUSTED_PROXY` `GITHUB_TOKEN` `GITHUB_OWNER` `GITHUB_REPO` `GITHUB_FILE_PATH` `GITHUB_BRANCH` `GOOGLE_DRIVE_CLIENT_ID` `GOOGLE_PICKER_API_KEY` `GOOGLE_CLOUD_PROJECT_NUMBER`、および Vercel システム変数 `VERCEL` `VERCEL_ENV` `VERCEL_PROJECT_PRODUCTION_URL`（`src/server/session.ts` の Cookie Secure 判定、`src/lib/mcp-config.ts` の production ゲートと MCP resource URL fallback、`auth` の rate-limit 信頼判定で使用）。

---

## 2. 公式仕様との照合（Build Output API v3 / CLI）

出典: vercel.com/docs/build-output-api（v3）、vercel.com/docs/cli/deploy、vercel.com/docs/cli/deploying-from-cli、vercel.com/docs/cli/promote（2026-11-02 時点の現行仕様）。

- `vercel pull --environment=preview|production` が `.vercel/project.json`（orgId/projectId）と対象 target の env ファイルを取得する。`vercel build`（`--prod` で production 用）は `.vercel/output` を生成する。`vercel deploy --prebuilt` はその `.vercel/output` をそのままアップロードして配信する（`--prod` で production、`--prod --skip-domain` で domain 未割当の staged production、`--archive=tgz` で upload 圧縮）。`vercel promote <url>` で production alias を即時差替、`vercel rollback` で直前へ戻せる。
- `.vercel/output` = `config.json`（`version: 3`、`routes`、`images`、`wildcard`、`overrides`、`cache`、`crons` 等）+ `static/`（Edge CDN 配信、`static/_vercel/immutable/` は immutable）+ `functions/*.func`。`vercel build` が Next.js の App Router page/route/proxy を functions と routing に分解してくれるため、自前で Build Output を構築しない。
- **注意点（公式の「When not to use --prebuilt」）**: prebuilt では System Environment Variables が build 時に存在しない。本アプリでは `NEXT_PUBLIC_VERCEL_ENV` が observability キルスイッチであり、build 時に空だと Sentry/PostHog が無効のまま成果物へ焼き込まれる。対策として GHA の build ジョブで `NEXT_PUBLIC_VERCEL_ENV` を target 値（`preview`/`production`）で明示設定する（§4）。
- Skew Protection を prebuilt で使う場合は custom deployment ID の設定が必要（`dpl_` プレフィックスは使用不可）。現状 Skew Protection は未使用と思われる（未確認）。

---

## 3. target 別成果物の生成と整合性検証

承認後の実装イメージ（workflow 定義の設計）。preview/production は**別 target・別成果物**として扱う。

### 3.1 生成手順（target ごと）

1. `pnpm install --frozen-lockfile`（Node 22.23.4 / pnpm 10.33.0、mise.toml と CI と同じ版）。
2. `vercel pull --yes --environment=<preview|production> --token=$VERCEL_TOKEN` で project 設定と target env を取得（`.vercel/project.json` に orgId/projectId が書かれるため `VERCEL_ORG_ID`/`VERCEL_PROJECT_ID` は代替経路としても利用可）。
3. `NEXT_PUBLIC_VERCEL_ENV=<target 値>` を明示して `vercel build [--prod] --token=...`。
4. `.vercel/output` の整合性を検証してから deploy へ進む:
   - `config.json` の `version === 3`、routes の存在
   - `functions/` 配下に App Router page/route・proxy 相当の `.func` が生成されていること
   - `static/` に `_next/static`・フォント・画像などの asset が入っていること
   - 成果物マニフェスト（全ファイルの SHA-256 + 対象 SHA + target 名）を生成し artifact へ保存。deploy 前に manifest を再計算して一致を確認（upload 断片・改ざん・別 SHA 混在の検知）
   - 成果物に秘密値が混入していないことのスキャン（gitleaks/自前 grep。既存 security 系 workflow と同じ粒度）
5. `vercel deploy --prebuilt [--prod] --token=...`（preview は既定で preview target）。

### 3.2 preview 成果物を production に流用しない理由

- `vercel pull --environment` で取り込む build-time env が target ごとに異なる（`NEXT_PUBLIC_*` は成果物へ焼き込まれ、後から差し替えられない）。`NEXT_PUBLIC_VERCEL_ENV` も target 値で焼き込む必要がある。
- production は Sentry release・本番向け env・`--prod` 指定でビルドする必要があり、preview 成果物の promote ではこれらが preview 値のまま残る。
- 同一 SHA でも target 別に build し直すのが公式の想定経路（`vercel build` は environment ごとの `.env` を使い分ける）。

### 3.3 未信頼 fork PR への credential 非付与

- deploy credential（VERCEL_TOKEN 等）は GitHub Environment（`Preview`/`Production`）の secrets に置き、protection rule（required reviewers / branch 制限）で main・信頼 branch のみに出す。
- `pull_request` イベントでは fork PR に secrets が渡らない（既存 e2e と同じ前提）。`pull_request_target` で deploy job を走らせない。`workflow_run` 連鎖で成果物を受け渡す場合は head SHA と actor を検証する。

---

## 4. 環境変数台帳（名前と用途のみ・値は書かない）

### 4.1 build-time（GHA の `vercel build` に必要）

| 名前 | 用途 | preview | production | 供給経路 |
| --- | --- | --- | --- | --- |
| `NEXT_PUBLIC_VERCEL_ENV` | observability キルスイッチ（空だと Sentry/PostHog が無効のまま焼き込まれる） | `preview` | `production` | **workflow で明示設定必須**（prebuilt では system env が build 時に存在しない） |
| `NEXT_PUBLIC_SENTRY_DSN` | Sentry ブラウザ送信先 | 要 | 要 | `vercel pull` が project env から `.vercel/.env.*` へ |
| `NEXT_PUBLIC_POSTHOG_KEY` / `NEXT_PUBLIC_POSTHOG_HOST` | PostHog 送信先 | 要 | 要 | 同上 |
| `SENTRY_ORG` / `SENTRY_PROJECT` / `SENTRY_AUTH_TOKEN` | sourcemap upload（無いと upload を skip して build は通る） | 任意 | 要（release/SHA 対応のため） | GitHub secret として `SENTRY_AUTH_TOKEN` が不足（§5）。ORG/PROJECT は値非秘密で vars 候補 |
| `ANALYZE` | bundle analyzer の任意スイッチ | 任意 | 任意 | workflow 入力 |
| `VERCEL_FORCE_NO_BUILD_CACHE` | build cache 二重ガード（#361） | 継続 | 継続 | `vercel pull` 経由（project env 側に設定済みと doc/05 に記録） |

### 4.2 runtime（Vercel project env が配信側で解決。GHA は関与しない）

| 名前 | 用途 | preview | production |
| --- | --- | --- | --- |
| `DATABASE_URL` | Neon 正本 DB 接続（runtime role） | 要 | 要 |
| `SESSION_SECRET` | 閲覧 cookie HMAC 署名 | 要 | 要 |
| `VIEWER_CODE` | 閲覧ゲート共有コード | 要 | 要 |
| `BETTER_AUTH_SECRET` / `BETTER_AUTH_URL` | 編集者ログイン | 要 | 要 |
| `SKILLSHEET_OWNER_ID` | 単一オーナー識別 | 要 | 要 |
| `REVALIDATE_SECRET` | /api/revalidate | 要 | 要 |
| `MCP_ENABLED` / `MCP_RESOURCE_URL` | Remote MCP 公開と aud | 任意 | 要（MCP 公開時） |
| `APP_ENV` / `TRUSTED_PROXY` | Cookie Secure 補助 / proxy 信頼 | 任意 | 任意 |
| `GITHUB_TOKEN` `GITHUB_OWNER` `GITHUB_REPO` `GITHUB_FILE_PATH` `GITHUB_BRANCH` | GitHub シード副系統 | 任意 | 要（副系統使用時） |
| `GOOGLE_DRIVE_CLIENT_ID` `GOOGLE_PICKER_API_KEY` `GOOGLE_CLOUD_PROJECT_NUMBER` | Drive 保存（#384） | 任意 | 要 |
| `VERCEL` `VERCEL_ENV` `VERCEL_PROJECT_PRODUCTION_URL` | runtime の環境判定（Cookie Secure、MCP production ゲート、resource URL fallback、rate-limit） | system env で自動供給 | 同左 |

### 4.3 Vercel project env の実登録状況

Vercel API の env 一覧取得が 403 で読めなかったため、**preview/production 各変数の実登録状況は未確認**。`vercel pull` 実行時に `.env.*` へ落ちる名前で照合し、差分を台帳へ追記する（要許可済み credential）。

---

## 5. credential 台帳

| credential | 用途 | 状態（2026-11-02） | 最小 scope の方針 |
| --- | --- | --- | --- |
| `VERCEL_TOKEN` | `vercel pull/build/deploy/promote/rollback` の CLI 認証 | **不足**。GitHub secrets に無し。Vercel MCP の既存 credential は MCP 用で GHA に流用しない | 対象 team `kouisos-projects` の deploy 権限だけの scoped token。作成・登録は許可後 |
| `VERCEL_ORG_ID` | team 特定（`vercel pull` の scope） | **不足**（GitHub secrets に無し）。値自体は `team_rWBWGQA0e6oD9KzMOIrMogLw` で確認済み | secrets ではなく variables でよい |
| `VERCEL_PROJECT_ID` | project 特定 | **不足**（同上）。値は `prj_Z0FMhFT8USOuRGtG2Fzz8LJxvWwW` で確認済み | 同上 |
| `SENTRY_AUTH_TOKEN`（GHA 用） | production build の sourcemap upload | **不足**（GitHub secrets に無し。Vercel project env 側には存在する可能性＝未確認） | internal integration の release 権限のみの token |
| GitHub Environment `Preview` / `Production` | deploy credential の scope 分離・protection rule | 環境の存在は確認済み。**secrets 未登録、protection rule は未確認** | deploy job は `environment:` 指定で environment secrets のみを読む |
| 既存 `DATABASE_URL` 等の runtime 系 | runtime のみ使用。prebuilt 化で追加は不要 | GitHub secrets に登録済み（e2e・定期チェック用） | deploy workflow へは secrets を新たに複写しない（runtime は Vercel project env が解決） |
| Slack 通知（`SLACK_BOT_TOKEN`） | deploy 失敗・smoke 失敗の通知 | 登録済み | 既存 CI Failure Slack Notify を使う |

## 6. 依存関係・最小権限・並行制御・二重 deploy 防止

- **build → deploy の依存**: deploy job は同 workflow 内の build+verify job の成功に `needs` でぶら下げる。build 失敗・manifest 検証失敗では deploy へ進まない。
- **最小権限**: deploy job は `permissions: contents: read` のみ（GitHub deployment 記録を付ける設計にする場合だけ `deployments: write` を追加）。Vercel 側は scoped token。GitHub Environment で preview/production を分離。
- **同一 target の並行制御**: `concurrency: vercel-deploy-<target>`（cancel-in-progress: false）。同一 SHA の再実行は manifest 照合で冪等、別 SHA はキューイングで直列化。production は cancel しない。
- **既存 Git 連携との二重 deploy 防止**: 切替時に Git 連携の auto-deploy を止める順序を固定する。
  1. prebuilt deploy 経路を preview で検証する段階では Git 連携を維持（二重 preview は URL が違うだけで実害は小さい）
  2. production 切替前に Git 連携の自動 deploy を解除（または production branch の連携を外す）→ prebuilt 経路へ切替
  3. 切替後に Git 連携由来と CLI 由来の両方で同 SHA が配信されないことを deployment 一覧で確認
  - Vercel 側の Git 連携解除は settings 変更のため許可後の作業。
- **失敗時の進行**: `vercel deploy` 自体が失敗した場合は staged deploy であれば本番 alias は動かないため影響なし。promote 後の異常は §7 rollback。

## 7. production 切替ゲート・rollback

### 切替ゲート（明示承認後のみ）

1. preview target で prebuilt 経路を実走し、隔離 preview で §8 の smoke と機能確認（SSR/RSC・閲覧/編集認証・拒否系・tRPC・OAuth/MCP・PDF/XLSX/DOCX・静的 asset・Sentry）を PC/390px 実画面で通す。
2. `vercel build --prod` で production 用成果物を別途生成 → `vercel deploy --prebuilt --prod --skip-domain` で domain 未割当の staged production を作る。
3. staged URL で smoke・機能確認を再実行し、磯貝さんの明示承認を得る。
4. `vercel promote <staged url>` で production alias を差替。同時に Git 連携の自動 deploy 解除。
5. 同一 SHA の二重 deploy が無いこと・既存 domain/origin・runtime env・配信機能を維持していることを確認して完了。

### rollback

- promote 後に問題が出た場合: `vercel rollback`（または `vercel promote <前の production deployment url>`）で直前の READY な production deployment へ即時差替。配信物の切替だけで DB・env 変数は無変更。
- 移行方式自体を戻す場合: Git 連携を再有効化し、main push または手動 deploy で Git 連携経路へ復帰。`turbopackFileSystemCacheForBuild: false` と `VERCEL_FORCE_NO_BUILD_CACHE=1` は Git 連携経路でも有効なまま（#361 対策のため維持）。
- rollback 手順の実走確認は preview target で行い、結果を台帳に追記する。

## 8. CSS smoke の接続

現状 `deploy-smoke.yml` は Vercel Git 連携の `deployment_status`（production 成功時）に依存している。CLI の `vercel deploy` は Git 連携由来でないため **`deployment_status` が発行されない可能性が高い**。確実な経路として:

- **正: deploy workflow 内の直接 smoke**。prebuilt deploy 成功後、返ってきた deployment URL と対象 SHA を `DEPLOYED_BASE_URL=<url>` で `node script/verify-deployed-css.mjs`（script は引数/環境変数で URL を受ける）に渡し、deploy SHA の globals.css と照合する。deploy job の成功＝smoke 成功とし、失敗は CI Failure Slack Notify で通知。
- **副: `deploy-smoke.yml` の workflow_dispatch**。既存の `base_url` input で任意 URL を検証できる経路は維持する。
- **Git 連携イベントに依存し続ける場合**: 実 preview deploy 後に GitHub API でその SHA の `deployments`/`deployment_statuses` が発行されたか実測する手順を切替検証に含める。発行されない場合は上記の直接経路を使う（実測は許可後の作業）。

## 9. #605 / #607 との関係

- **#605（Draft PR、Vercel 維持 + Workers UI + 共通 D1）**: Node を 22.23.4 → 24.22.1、Google Fonts build 時取得 → 固定版 Fontsource（IBM Plex）へ変更する内容を含む。prebuilt 経路の build job は mise.toml の版に追随するため、#605 が main に入れば GHA build も Node 24 / Fontsource になる。Vercel project 側の nodeVersion（現在 `22.x`）と GHA build 側の版が乖離する点は、#605 マージ時に再評価する（runtime の Node は Vercel project 設定が効く）。また `vercel build` が Fontsource 版フォントを `static/` に含めることを #605 適用後の検証項目に追加する。#605 の branch/PR には触れない。
- **#607（SBI、Workers 実ランタイムでの出力検証）**: deployment 設定ファイルを触らない約束で #606 と分かれている。Workers 側（`worker/`、wrangler、OpenNext 設定）は本設計の対象外とし、変更しない。

## 10. 秘密値・本番経歴データの非露出

- 台帳・ログ・PR・Issue・artifact に秘密値を書かない。`vercel pull` が落とす `.env.*`、deploy 出力、manifest を artifact に上げる場合はスキャンしてから上げる。
- `vercel` CLI の deploy 出力は URL と状態のみを抜き出し、token・env 値を echo しない（`--token` は secrets 参照、stdout には出さない）。
- 実経歴本文（本番 DB の内容）は本設計のどの段階でも artifact・ログ・検証画面に出さない。隔離 preview の検証は合成データのみ。

## 11. 未解決のまま残っていること

- Vercel project の env 一覧が API 403 で読めず、preview/production 各変数の**実登録状況は未確認**。`vercel pull` での照合は許可済み credential が必要。
- CLI prebuilt deploy が GitHub `deployment_status` を発行するかは未実測（§8 の直接経路を正として設計し、実測は切替時に行う）。
- Vercel project の Git 連携詳細（production branch・build 設定・expose system env vars の ON/OFF）は設定画面の確認が必要（API では取得範囲外の項目あり）。
- Skew Protection の使用有無は未確認（使用する場合は prebuilt で custom deployment ID が必要）。
- Codex が作成した設計コミット（`8758bef`/`478092a`/`6f95a9e`）は Codex Cloud 内に留まり GitHub へ未 push。本台帳はリポジトリ一次情報からの再作成であり、Codex 版との差分照合は Codex 側のタスク画面から差分を取り出せた場合に限る。

## 12. 未到達の一次情報

- Vercel project の env 変数一覧（403 のため未到達）
- Vercel project settings の Git 連携・Build and Development Settings 詳細
- GitHub Environment `Production`/`Preview` の protection rule 詳細（存在は確認、中身は未読）
- Codex Cloud 内の 3 コミット内容本体

# 01. セットアップとルーティング

このドキュメントでは、現行の skillsheet-viewer を動かすための開発環境セットアップと、Next.js App Router によるルーティング構成を解説する。

関連ドキュメント: [02 認証](02_authentication.md) / [03 データ層](03_github_api.md) / [04 Markdown 表示](04_markdown_display.md) / [05 目次とデプロイ](05_toc_and_deploy.md)

---

## 技術スタック

- **構成**: pnpm workspaces モノレポ（`apps/web` + `packages/db`）
- **言語**: TypeScript
- **フレームワーク**: Next.js 16（App Router / React Server Components）
- **UI**: Tailwind CSS v4 + shadcn/ui（Radix UI）、アニメーションは framer-motion
- **Markdown**: react-markdown（remark-gfm / remark-breaks → rehype-raw → rehype-sanitize → rehype-slug）
- **DB / ORM**: Drizzle ORM + Neon serverless Postgres（正本データ源）
- **認証**: 2 系統（編集者 = Better Auth / 閲覧者 = HMAC 署名 cookie）
- **PDF**: `@react-pdf/renderer`（クライアントで動的 import）
- **ランタイム管理**: mise（Node 22.x）、パッケージマネージャは pnpm

---

## Part 1: 開発環境の準備

### mise によるツール固定

リポジトリルートの `mise.toml` で Node と pnpm のバージョンを固定している。

```toml
[tools]
node = "22.21.1"
pnpm = "10.33.0"
```

mise を導入済みなら、リポジトリに入るだけで指定バージョンが有効になる。

```bash
mise install   # mise.toml の指定バージョンを取得
node --version # v22.x
pnpm --version # 10.33.0
```

`package.json` でも `engines.node` に `22.x`、`packageManager` に `pnpm@10.33.0` を宣言している。

### モノレポ構成

`pnpm-workspace.yaml` が管理対象パッケージを定義する。

```yaml
packages:
  - apps/*
  - packages/*
```

| パッケージ | 役割 |
|-----------|------|
| `apps/web`（`@skillsheet/web`） | Next.js アプリ本体（画面・API・サーバー処理） |
| `packages/db`（`@skillsheet/db`） | Drizzle スキーマ、ブロックモデル、DB アクセス層 |

`apps/web` は `@skillsheet/db` を `workspace:*` として参照する。

### 依存インストールと主要コマンド

いずれもリポジトリルートで実行する。

```bash
pnpm install         # 全パッケージの依存を導入
pnpm dev             # 開発サーバー起動（apps/web / next dev）
pnpm build           # 本番ビルド
pnpm -r type-check   # 全パッケージ型チェック
pnpm -r --if-present test  # 全テスト（vitest）
pnpm db:generate     # Drizzle マイグレーション生成
pnpm db:migrate      # マイグレーション適用
```

環境変数のセットアップ手順は `SETUP.md` を参照。必須変数（`DATABASE_URL` / `SESSION_SECRET` / `VIEWER_CODE` / `BETTER_AUTH_SECRET` / `SKILLSHEET_OWNER_ID`）は `apps/web/src/lib/env.ts` の `assertServerEnv()` が起動時に検証し、欠けていれば全欠落を列挙して即座に throw する。

---

## Part 2: App Router とルーティング

Next.js App Router では `apps/web/app` 配下のディレクトリ構造がそのまま URL になる。ページは既定で React Server Component（RSC）として動作し、`'use client'` を宣言したファイルのみクライアントコンポーネントになる。

### ルート一覧

| パス | ファイル | 種別 | 概要 |
|------|---------|------|------|
| `/` | `app/page.tsx` | Server | `/view` へ `redirect()` |
| `/view` | `app/view/page.tsx` | Server | DB シート一覧（正本経路） |
| `/view/db` | `app/view/db/page.tsx` | Server | デフォルトシート単体表示（後方互換） |
| `/view/db/[id]` | `app/view/db/[id]/page.tsx` | Server | ID 指定のシート表示 |
| `/view/[path]` | `app/view/[path]/page.tsx` | Server | GitHub 由来 `.md` の表示（レガシー経路） |
| `/compare` | `app/compare/page.tsx` | Server | 2 シートの左右比較 |
| `/builder` | `app/builder/page.tsx` | Server → Client | 編集者向けブロックビルダー |
| `/login` | `app/login/page.tsx` | Client | 編集者ログイン（Better Auth） |
| `/viewer-auth` | `app/viewer-auth/page.tsx` | Client | 閲覧コード認証（HMAC） |
| `/api/auth` | `app/api/auth/route.ts` | Route Handler | 閲覧コード検証＋ cookie 発行 |
| `/api/auth/[...all]` | `app/api/auth/[...all]/route.ts` | Route Handler | Better Auth の全エンドポイント |
| `/api/logout` | `app/api/logout/route.ts` | Route Handler | 閲覧 cookie の失効 |
| `/api/revalidate` | `app/api/revalidate/route.ts` | Route Handler | GitHub 読み経路のキャッシュ失効 |

`[path]` や `[id]` は動的セグメントで、`params` は `Promise` として渡る（`const { id } = await params`）。

### ルートレイアウト

`app/layout.tsx` が全ページ共通の `<html>` を生成する。ここで行っていること:

- `assertServerEnv()` を呼び、必須サーバー環境変数の存在をフェイルファストで検証。
- `next/font/google` で IBM Plex Sans JP / IBM Plex Mono を読み込み CSS 変数化。
- ハイドレーション前に `localStorage` のテーマ設定を `<html>` の `.dark` クラスへ反映するインラインスクリプトを注入（テーマの FOUC 防止）。
- `Providers`（`app/providers.tsx`）で全体をラップ。

### RSC とデータ取得

一覧・表示系のページはサーバー側で DB を読む Server Component である。DB 依存（`DATABASE_URL`）はランタイム専用のため、`next build` の静的解析で評価されないよう `connection()`（`next/server`）を先頭で呼び、そのコンポーネントを動的レンダリングに切り替えている。

```tsx
// app/view/page.tsx（抜粋）
export default async function SheetsListPage() {
  await connection(); // DATABASE_URL はランタイム専用。動的レンダリングを確保
  const sheets = await getCachedDbSheets();
  return <DbSheetsListClient initialSheets={sheets} hasError={hasError} />;
}
```

サーバーで取得したデータを props でクライアントコンポーネント（`*-client.tsx`）へ渡す、というのが本プロジェクトの基本パターンである。

### /view 配下の閲覧ゲート（レイアウトによる保護）

`/view`・`/view/db`・`/view/[path]` は `app/view/layout.tsx` の下に入り、このレイアウトが描画前に `requireViewer()` を呼ぶ。閲覧用 HMAC cookie も Better Auth 編集者セッションも無ければ `/viewer-auth` へリダイレクトする。

```tsx
// app/view/layout.tsx
import { requireViewer } from '@/server/viewer-gate';

export default async function ViewLayout({ children }: { children: React.ReactNode }) {
  await requireViewer(); // 未認証なら内部で /viewer-auth へ redirect
  return children;
}
```

`/viewer-auth` と `/login` はこのセグメントの外にあるため、ゲート対象外である。`/compare` は `view` セグメント外だが、ページ本体で明示的に `requireViewer()` を呼んで同じ保護をかけている。認証の詳細は [02 認証](02_authentication.md) を参照。

---

## まとめ

- mise で Node/pnpm を固定し、pnpm workspaces で `apps/web` と `packages/db` を束ねる。
- ルーティングは `app/` のディレクトリ構造がそのまま URL。ページは既定で RSC。
- `/view` 配下は `view/layout.tsx` の `requireViewer()` が一括で閲覧ゲートをかける。
- DB を読むページは `connection()` で動的化してからサーバー側でデータ取得し、クライアントコンポーネントへ props で渡す。

次は [02 認証](02_authentication.md) で 2 系統の認証を解説する。

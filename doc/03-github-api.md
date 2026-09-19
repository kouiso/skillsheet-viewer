# 03. データ層（Neon DB 正本 + GitHub シード副系統）

skillsheet-viewer のデータ源は **Neon Postgres（Drizzle ORM）を正本**とする。スキルシートは「順序付きブロックの配列」として DB に保存され、表示時に 1 つの Markdown 文書へ連結される。GitHub からの Markdown 取得は、DB が空のときの初回シードとレガシー閲覧経路にのみ残る副系統である。

関連ドキュメント: [02 認証](02-authentication.md) / [04 Markdown 表示](04-markdown-display.md) / [05 目次とデプロイ](05-toc-and-deploy.md)

---

## Part 1: スキーマ

`src/db/schema.ts` が Drizzle でテーブルを定義する。

### skill_sheets / blocks

```ts
// src/db/schema.ts（抜粋）
export const skillSheets = pgTable('skill_sheets', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  ownerId: text('owner_id').notNull(),
  title: text('title').notNull(),
  theme: text('theme').notNull().default('light'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
}, (table) => [index('skill_sheets_owner_id_idx').on(table.ownerId)]);

export const blocks = pgTable('blocks', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  sheetId: uuid('sheet_id').notNull().references(() => skillSheets.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  order: integer('order').notNull(),
  data: jsonb('data').notNull(),
}, (table) => [unique('blocks_sheet_id_order_unique').on(table.sheetId, table.order)]);
```

- 1 シートは複数ブロックを持ち、`ownerId` で所有者を持つ（複数シート対応のため unique 制約は外しインデックス化）。
- `(sheet_id, order)` は一意。順序重複を防ぎ、order 順取得を高速化する。
- `blocks.data` は `jsonb`。ブロック種別ごとの構造化データを格納する。

### Better Auth テーブル

同ファイルに `user` / `session` / `account` / `verification` を Better Auth v1.6 の既定 Drizzle スキーマ（単数形テーブル名）に合わせて定義している。編集者認証（[02](02-authentication.md)）が使用する。

---

## Part 2: ブロックモデルと Markdown 変換

`src/db/block.ts` がブロックのデータモデルと Markdown 変換を担う。ブロックは `type` と `data` を一致させた判別ユニオンで、次の 7 種類がある。

| type | 内容 | 変換先 |
|------|------|--------|
| `markdown` | 任意の Markdown | そのまま |
| `table` | 列揃え付きの表 | GFM 表 |
| `skills` | カテゴリ＋スキル一覧 | GFM 表（Web では専用コンポーネント） |
| `experience` | 職務経歴 | 見出し＋表 |
| `profile` | プロフィール（名前・PR・強み・メタ） | 見出し＋表 |
| `stats` | 4 枠統計 | GFM 表 |
| `project` | 案件（会社情報＋案件一覧＋技術スタック） | 見出し＋表 |

### blocksToMarkdown

各ブロックは `type` に応じて Markdown 文字列へ変換される（`tableBlockToMarkdown` / `skillsBlockToMarkdown` / `experienceBlockToMarkdown` / `profileBlockToMarkdown` / `statsBlockToMarkdown` / `projectBlockToMarkdown`）。`blocksToMarkdown` はブロック配列を `order` 昇順で連結する。

```ts
// src/db/block.ts（抜粋・要約。実際は隣接ブロックの区切り規則 blockJoinSeparator も適用する）
export function blocksToMarkdown(blocks: Block[]): string {
  return [...blocks]
    .filter((b) => !isBlockInputEmpty(b)) // 中身が空のブロックは連結対象から除く（描画時のスキップ）
    .sort((a, b) => a.order - b.order)
    .map(blockToMarkdown)
    .join('\n');
}
```

- 表への変換では `escapeCell()` がセル内改行を空白へ、`|` をエスケープし、空セルを半角スペース 1 つに整えて GFM 表の崩れを防ぐ。列揃えは `:---` / `:---:` / `---:` で表現する。
- `blockToMarkdown` は型システム上到達不能な未知 type を `''` として扱い、他ブロックを壊さない。`isBlockInputEmpty` も未知 type を空として扱うが、こちらは DB 由来の壊れた/未知の行を実際に受け取りうる実行時の防御であり、両者とも単なる型システムの建前ではない。
- **中身が空のブロックは `blocksToMarkdown` の連結対象から除かれる** — テンプレの空スカフォールドが `### （現在）` のような孤立セクションとして PDF や `/view/db` に出るのを防ぐ（issue #128）。ブロック自体は DB に残るので、Web の viewer（`groupBlocks`）でも同じ基準（`isBlockInputEmpty`）でスキップしている。

table / experience は Markdown 経由で描画するが、skills / profile / stats / project は Web 側で専用の React コンポーネントとして描画される（[04](04-markdown-display.md) 参照）。PDF は mdast → `@react-pdf` パイプラインを共有する。

### バリデータと splitMarkdownIntoBlocks

- 各ブロックには `isMarkdownBlockData` などの軽量型ガードがあり、`isBlockInput()` がクライアント由来の untyped 入力を検証する（zod を入れず DB パッケージの依存を増やさない方針）。
- `splitMarkdownIntoBlocks()` は Markdown 文書をレベル 2〜4 見出しや `<details>` の境界で分割し、`markdown` ブロック配列にする（シード用）。連結（`blocksToMarkdown`）すると、空白のみのセグメント（分割ノイズ。シード経路で事前に除いている）を除いて元文書とおおむね一致する。

---

## Part 3: 読み取り・保存

`src/db/skillsheet.ts` は `getOwnerId()` / `SkillSheetNotFoundError` 等の共通部品のみを持ち、
DB アクセスの中心は `src/db/document-service.ts` の `createDocumentService(getDb(), owner)`。
すべての読み書きは `skillsheet_private` スキーマの文書境界 SQL 関数経由で行い、
ランタイムロールはテーブルを直接触らず `EXECUTE` のみを持つ（doc/05 参照）。
DB クライアントは `src/db/client.ts` の `getDb()`（Neon serverless / WebSocket ドライバ、
`DATABASE_URL` からモジュールスコープでキャッシュ）を使う。

### オーナー ID

```ts
// skillsheet.ts（抜粋）
function getOwnerId(): string {
  const id = process.env.SKILLSHEET_OWNER_ID;
  if (!id) throw new Error('SKILLSHEET_OWNER_ID is not set');
  return id;
}
```

個人名のベタ書きを排し、`SKILLSHEET_OWNER_ID` 環境変数から取得する。
owner 照合自体は境界 SQL 側が `skillsheet_private.principals` の SESSION_USER マッピングで行う。

### 読み取り

- `documents().list()`: オーナーのシート一覧（`DocumentSummary[]`。`skillsheet_private.list_sheets`）。
- `documents().read(sheetId)`: 指定シートを `skillsheet_private.read_snapshot` で読み、
  `{ sheetId, revision, title, blocks, validation }` の snapshot を返す。
  `revision` は decimal 文字列（JS の Number 精度を超えないよう API 境界では文字列で持ち回る）。
- 壊れた/未知のブロック行は `validateDocumentBlocks` で issues に集約し、
  snapshot の `validation.editable` で編集可否を表す。

### 保存（documents().replace）

保存の要は `documents().replace(sheetId, expectedRevision, title, blocks)` で、
`skillsheet_private.replace_sheet` が単一呼び出しで CAS・置換・revision 採番を行う。
サービス側は呼び出し前に `read()` で現行 revision を確認するが、最終判定は常に DB 側の
CAS であり、読取成功を更新権限や版一致の代用にしない。

- **所有者検証**: owner は境界 SQL が principals マッピングで照合し、
  未マッピングや他人のシートは `UNMAPPED_PRINCIPAL` / `NOT_FOUND` で拒否される。
- **楽観ロック（CAS）**: `expectedRevision` が現行 `revision` と一致しない限り
  `CONFLICT` で保存しない。ロストアップデートを防ぐ。
- **削除**: `documents().delete(sheetId, expectedRevision)` も同じ CAS。
- 保存前に `normalizeBlockInput()`（markdown 末尾空白除去・table 行の列数正規化）だけを行う。**`isBlockInputEmpty()` は永続化フィルタとして使わない** — テンプレの空ブロック（入力用スカフォールド）やユーザーが「追加」したばかりの空ブロックも、中身が空のまま insert される。空判定は描画時（`blocksToMarkdown` / Web の `groupBlocks`）と「シート全体が空」ガード（自動保存スキップ・全消し保存の confirm）でのみ使う（issue #128）。

### tRPC mutation からの利用

ビルダーの保存は `src/server/trpc/router/sheet.ts` の `sheet.save` procedure が入口（以前の Server Action 経路は廃止済み）。`editorProcedure` ミドルウェアが `getEditorUserId()` で認可を再検証し、`saveSheetInputSchema`（`src/server/trpc/schema.ts` の zod スキーマ）でペイロードを検証してから `documents().replace()` を呼ぶ。`DocumentError` の `CONFLICT` は `TRPCError({ code: 'CONFLICT' })` に、`NOT_FOUND` 等は対応するコードに変換してクライアントへ返す。`sheet.create` / `sheet.delete` も同じ `editorProcedure` を使う。

---

## Part 4: GitHub シード副系統

DB が空のときだけ、既存の GitHub プライベートリポジトリの Markdown を初回シードとして取り込む。

- `fetchMarkdownFromGitHub()`（`skillsheet.ts`）: `GITHUB_TOKEN` / `GITHUB_OWNER` / `GITHUB_REPO`（および `FILE_PATH` / `BRANCH`）でファイルを取得し、Base64 を UTF-8 デコードする。トークンはサーバー専用で、ブラウザには渡らない。
- `ensureSeeded()`: デフォルトシートのブロックが 0 件なら、取得した Markdown を `splitMarkdownIntoBlocks()` で分割し `onConflictDoNothing()` で挿入する。
- レガシー閲覧経路 `/view/[path]` は `src/server/github-sheet.ts` を使い、リポジトリ直下の `.md` を列挙・取得する。`isValidSheetPath()`（`..` やスラッシュを弾き、日本語ファイル名は Unicode プロパティで許容）と `isSheetFileName()`（README / CLAUDE.md などの設定・AI 指示系を除外）で対象を絞る。ファイル不在は `SheetNotFoundError` として `notFound()`（404）に、システムエラーは再スローに振り分ける。

GitHub 系の環境変数は任意扱いで、`assertServerEnv()` は欠けても warn のみ（DB 経由の表示には影響しない）。

---

## Part 5: キャッシュと revalidate

`src/server/sheet-cache.ts` が `unstable_cache` でラップした読み取り関数群を提供する。
一覧（`/view`）は `sheet.list` → `navigation()` が境界 SQL を毎回直接呼ぶためキャッシュを介さない。

| 関数 | 対象 | tag | revalidate |
|------|------|-----|-----------|
| `getCachedDbSheetById` | ID 指定 DB シート | `db-sheet` | 60s |
| `getCachedDbSheet` | デフォルト DB シート | `db-sheet` | 60s |
| `getCachedSheets` / `getCachedSheet` | GitHub 経路（レガシー） | `sheets` | 3600s |

- `sheet.save` / `create` / `delete` の各 tRPC mutation は保存/作成/削除後に `revalidateTag('db-sheet', { expire: 0 })` を呼び、`db-sheet` タグを即時失効させる。
  - **`next/cache` の `updateTag` は使えない**: `updateTag` は Server Action 専用の API で Route Handler から呼ぶと実行時エラーになる（Next.js 16 公式ドキュメント）。tRPC の mutation は必ず Route Handler（`/api/trpc/[trpc]`）経由で実行されるため、代わりに `revalidateTag(tag, { expire: 0 })` で即時失効させる。空の `{}` は expire 未指定＝即時失効の保証が無いため、明示的に `{ expire: 0 }` を指定する（`app/api/revalidate/route.ts` が先に解決していた同じ問題のパターンを踏襲）。
- GitHub 読み経路（`sheets` タグ）は tRPC の `maintenance.revalidate` で手動失効できる。`REVALIDATE_SECRET` を `Authorization: Bearer` か `?secret=` で照合し、`timingSafeEqual` で比較する。既存の webhook や運用スクリプト向けに `POST /api/revalidate` を互換アダプタとして残している。

---

## まとめ

- 正本は Neon DB。スキルシート＝順序付きブロック配列で、`blocksToMarkdown` が 1 つの Markdown へ連結する。
- 保存は文書境界 SQL（`skillsheet_private.replace_sheet`）の revision CAS で所有者検証・楽観ロック・採番を行う。
- GitHub は DB 空時のシードとレガシー `/view/[path]` の副系統として残る。
- 読み取りは `unstable_cache` でタグ付けし、tRPC mutation 後は `revalidateTag(tag, { expire: 0 })` で即時失効させる（`updateTag` は Route Handler から使えないため使用しない）。
- 認可・入力検証・エラーコードは `src/server/trpc/router/*.ts` の procedure に集約されている（詳細は `01-setup-and-routing.md` の「RSC とデータ取得（tRPC server caller）」参照）。

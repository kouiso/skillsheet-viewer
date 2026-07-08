# 03. データ層（Neon DB 正本 + GitHub シード副系統）

skillsheet-viewer のデータ源は **Neon Postgres（Drizzle ORM）を正本**とする。スキルシートは「順序付きブロックの配列」として DB に保存され、表示時に 1 つの Markdown 文書へ連結される。GitHub からの Markdown 取得は、DB が空のときの初回シードとレガシー閲覧経路にのみ残る副系統である。

関連ドキュメント: [02 認証](02_authentication.md) / [04 Markdown 表示](04_markdown_display.md) / [05 目次とデプロイ](05_toc_and_deploy.md)

---

## Part 1: スキーマ

`packages/db/src/schema.ts` が Drizzle でテーブルを定義する。

### skill_sheets / blocks

```ts
// packages/db/src/schema.ts（抜粋）
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

同ファイルに `user` / `session` / `account` / `verification` を Better Auth v1.6 の既定 Drizzle スキーマ（単数形テーブル名）に合わせて定義している。編集者認証（[02](02_authentication.md)）が使用する。

---

## Part 2: ブロックモデルと Markdown 変換

`packages/db/src/blocks.ts` がブロックのデータモデルと Markdown 変換を担う。ブロックは `type` と `data` を一致させた判別ユニオンで、次の 7 種類がある。

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
// packages/db/src/blocks.ts（抜粋）
export function blocksToMarkdown(blocks: Block[]): string {
  return [...blocks].sort((a, b) => a.order - b.order).map(blockToMarkdown).join('\n');
}
```

- 表への変換では `escapeCell()` がセル内改行を空白へ、`|` をエスケープし、空セルを半角スペース 1 つに整えて GFM 表の崩れを防ぐ。列揃えは `:---` / `:---:` / `---:` で表現する。
- 型システム上到達不能な未知 type は `''` を返し、他ブロックを壊さない。

table / experience は Markdown 経由で描画するが、skills / profile / stats / project は Web 側で専用の React コンポーネントとして描画される（[04](04_markdown_display.md) 参照）。PDF は mdast → `@react-pdf` パイプラインを共有する。

### バリデータと splitMarkdownIntoBlocks

- 各ブロックには `isMarkdownBlockData` などの軽量型ガードがあり、`isBlockInput()` がクライアント由来の untyped 入力を検証する（zod を入れず DB パッケージの依存を増やさない方針）。
- `splitMarkdownIntoBlocks()` は Markdown 文書をレベル 2〜4 見出しや `<details>` の境界で分割し、無損失な `markdown` ブロック配列にする。連結すると元文書に一致する（シード用）。

---

## Part 3: 読み取り・保存

`packages/db/src/skillsheet.ts` が DB アクセスの中心。DB クライアントは `packages/db/src/client.ts` の `getDb()`（Neon serverless / WebSocket ドライバ、`DATABASE_URL` からモジュールスコープでキャッシュ）を使う。

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

### 読み取り

- `listSheets()`: オーナーのシート一覧（`SheetSummary[]`）。
- `getSkillSheetById(sheetId)`: 指定 ID のシートを `{ title, content, blocks }` として返す。DB 行は `rowToBlock()` が型ガード付きで `Block` へ変換し、壊れた/未知の JSON は `null` にして skip する（読み込み側の防御）。
- `getSkillSheet()`: デフォルトシートを読む。空なら GitHub からシードする（後述）。

### 保存（saveSkillSheetBlocks）

`saveSkillSheetBlocks(title, blocksInput, sheetId?, expectedUpdatedAt?)` が保存の要。全処理を単一トランザクションで囲み、次の 3 つの保護を提供する。

```ts
// skillsheet.ts（抜粋・要約）
return db.transaction(async (tx) => {
  let resolvedSheetId: string;
  if (sheetId) {
    // A2: 所有者検証 — id + ownerId を同一トランザクション内で照合（TOCTOU 回避）
    const [existing] = await tx.select(...).where(and(eq(id, sheetId), eq(ownerId, ...))).limit(1);
    if (!existing) throw new Error('Forbidden: sheet does not belong to the current owner');
    resolvedSheetId = sheetId;
  } else {
    resolvedSheetId = await getOrCreateDefaultSheetId(tx);
  }

  // A3: 楽観ロック — 行ロック（for('update')）で updatedAt を読み、期待より新しければ中断
  if (expectedUpdatedAt) {
    const [current] = await tx.select({ updatedAt }).where(eq(id, resolvedSheetId)).for('update').limit(1);
    if (current && current.updatedAt.getTime() > new Date(expectedUpdatedAt).getTime()) {
      throw new ConflictError();
    }
  }

  await tx.delete(blocks).where(eq(blocks.sheetId, resolvedSheetId));
  // cleaned なブロックを order 付きで一括 insert
  const [updated] = await tx.update(skillSheets).set({ title, updatedAt: sql`now()` })... .returning({ updatedAt });
  return { updatedAt: updated.updatedAt }; // A4: サーバー時刻を返す
});
```

- **A2 所有者検証**: `sheetId` 指定時に `id + ownerId` を同一トランザクション内で照合し、他人のシートを破壊しない。
- **A3 楽観ロック**: `expectedUpdatedAt` を渡すと、`for('update')` で行ロックを取り、現在の `updatedAt` がそれより新しい場合に `ConflictError`（`skillsheet.ts` で定義）を throw する。ロストアップデートを防ぐ。
- **A4**: 保存後のサーバー時刻 `updatedAt` を返す。クライアントはこれを次回の `expectedUpdatedAt` に使い、時計ズレによる誤 Conflict を防ぐ。
- 保存前に `normalizeBlockInput()`（markdown 末尾空白除去・table 行の列数正規化）と `isBlockInputEmpty()` による空ブロック除去を行う。

`createSheet()` / `deleteSheet()` も同様にオーナーを検証し、`createSheet` はシートとブロックの挿入を単一トランザクションで囲む。

### Server Action からの利用

ビルダーの保存は `app/builder/actions.ts` の `saveBlocksAction` が入口。`isEditor()` で認可を再検証し、`isBlockInput` でペイロードを検証してから `saveSkillSheetBlocks` を呼ぶ。`ConflictError` は `{ ok: false, error: 'conflict' }` に変換してクライアントへ返す。保存成功後は `revalidateTag('db-sheet', {})` で `/view` 系のキャッシュを即時失効させる。

---

## Part 4: GitHub シード副系統

DB が空のときだけ、既存の GitHub プライベートリポジトリの Markdown を初回シードとして取り込む。

- `fetchMarkdownFromGitHub()`（`skillsheet.ts`）: `GITHUB_TOKEN` / `GITHUB_OWNER` / `GITHUB_REPO`（および `FILE_PATH` / `BRANCH`）でファイルを取得し、Base64 を UTF-8 デコードする。トークンはサーバー専用で、ブラウザには渡らない。
- `ensureSeeded()`: デフォルトシートのブロックが 0 件なら、取得した Markdown を `splitMarkdownIntoBlocks()` で分割し `onConflictDoNothing()` で挿入する。
- レガシー閲覧経路 `/view/[path]` は `apps/web/src/server/github-sheets.ts` を使い、リポジトリ直下の `.md` を列挙・取得する。`isValidSheetPath()`（`..` やスラッシュを弾き、日本語ファイル名は Unicode プロパティで許容）と `isSheetFileName()`（README / CLAUDE.md などの設定・AI 指示系を除外）で対象を絞る。ファイル不在は `SheetNotFoundError` として `notFound()`（404）に、システムエラーは再スローに振り分ける。

GitHub 系の環境変数は任意扱いで、`assertServerEnv()` は欠けても warn のみ（DB 経由の表示には影響しない）。

---

## Part 5: キャッシュと revalidate

`apps/web/src/server/sheets-cache.ts` が `unstable_cache` でラップした読み取り関数群を提供する。

| 関数 | 対象 | tag | revalidate |
|------|------|-----|-----------|
| `getCachedDbSheets` | DB シート一覧 | `db-sheet` | 60s |
| `getCachedDbSheetById` | ID 指定 DB シート | `db-sheet` | 60s |
| `getCachedDbSheet` | デフォルト DB シート | `db-sheet` | 60s |
| `getCachedSheets` / `getCachedSheet` | GitHub 経路（レガシー） | `sheets` | 3600s |

- 編集系 Server Action は保存/作成/削除後に `revalidateTag('db-sheet', {})` を呼び、`db-sheet` タグを即時失効させる。
- GitHub 読み経路（`sheets` タグ）は `POST /api/revalidate`（`app/api/revalidate/route.ts`）で手動失効できる。`REVALIDATE_SECRET` を `Authorization: Bearer` か `?secret=` で照合し、`timingSafeEqual` で比較する。Next 16 の `revalidateTag` は第 2 引数必須のため空の設定 `{}` を渡している。

---

## まとめ

- 正本は Neon DB。スキルシート＝順序付きブロック配列で、`blocksToMarkdown` が 1 つの Markdown へ連結する。
- 保存は単一トランザクション内で所有者検証（A2）・楽観ロック（A3・`ConflictError`）・サーバー時刻返却（A4）を行う。
- GitHub は DB 空時のシードとレガシー `/view/[path]` の副系統として残る。
- 読み取りは `unstable_cache` でタグ付けし、編集後は `revalidateTag` で即時失効させる。

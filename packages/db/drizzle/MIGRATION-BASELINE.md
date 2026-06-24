# 既存本番 DB のマイグレーション baseline 手順

このドキュメントは、**すでにテーブルが存在する既存の本番 Neon DB** に対して
drizzle のマイグレーション管理を後付けで導入するための手順をまとめたものです。

> 破壊的操作を含む手順を扱います。本番 DB への SQL 実行は影響範囲を理解した上で、
> バックアップ（Neon ブランチ等）を取ってから実行してください。

## なぜ baseline が必要なのか

現状を整理します。

- 本番 Neon DB には、すでに以下のテーブルが**存在**します。
  - Better Auth 系: `user` / `session` / `account` / `verification`
  - アプリ系: `blocks` / `skill_sheets`
- これらは drizzle-kit ではなく、**Better Auth CLI の migrate で先に作られた**ものです。
  そのため制約名が Postgres デフォルト（例: `session_token_key`）になっており、
  リポジトリのマイグレーションが生成する名前（例: `session_token_unique`）とは一致しません。
- 本番 DB には drizzle の進捗管理テーブル `drizzle.__drizzle_migrations` が**まだありません**。
- 一方リポジトリには以下 2 本のマイグレーションが存在します。
  - `0000_init`（`blocks` / `skill_sheets`）
  - `0001_deep_switch`（Better Auth 系テーブル）

この状態で `pnpm db:migrate` をそのまま既存本番 DB に流すと、
**「テーブルがすでに存在する」エラーで失敗**します（`CREATE TABLE "user" ...` 等が衝突するため）。

そこで「この 2 本はすでに適用済みである」と drizzle に教えてあげる作業（= baseline）を**1 回だけ**行います。
こうすれば、

- 既存本番 DB に対する `pnpm db:migrate` は安全な no-op になる
- これ以降に追加される新しいマイグレーション（`0002_...` 以降）は通常どおり適用される

という状態になります。

## drizzle の進捗管理の仕組み（baseline の前提知識）

drizzle は `drizzle` スキーマの `__drizzle_migrations` テーブルで適用済みマイグレーションを管理します。
テーブル定義は drizzle-orm が migrate 実行時に自動生成するもので、以下のとおりです。

```sql
CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
  id SERIAL PRIMARY KEY,
  hash text NOT NULL,
  created_at bigint
);
```

| カラム | 意味 |
|--------|------|
| `id` | 連番（SERIAL） |
| `hash` | マイグレーション SQL ファイル全文の SHA-256（記録用） |
| `created_at` | 各マイグレーションの `meta/_journal.json` の `when`（ミリ秒 epoch） |

**重要な挙動**: drizzle が「適用するかどうか」を判定する基準は `created_at` です。
具体的には、テーブル内の `MAX(created_at)` より大きい `when` を持つマイグレーションだけを適用します
（`drizzle-orm` の migrate 実装で `Number(lastDbMigration.created_at) < migration.folderMillis` を条件に適用）。
`hash` の一致は判定に使われません。したがって baseline で最も重要なのは、
**各マイグレーションの `created_at` を `_journal.json` の `when` と正確に一致させる**ことです。

## (a) `__drizzle_migrations` が存在するかの確認

まず本番 DB の現状を確認します（参照のみ・破壊的ではありません）。

スキーマとテーブルの有無:

```sql
-- drizzle スキーマがあるか
SELECT 1 FROM information_schema.schemata WHERE schema_name = 'drizzle';

-- 進捗管理テーブルがあるか
SELECT to_regclass('drizzle.__drizzle_migrations') AS migrations_table;
```

すでにテーブルがある場合は、適用済み行を確認します:

```sql
SELECT id, hash, created_at
FROM drizzle.__drizzle_migrations
ORDER BY created_at;
```

判断:

- `migrations_table` が `NULL`（テーブルなし）→ このドキュメントの (b) で baseline する。
- すでに `0000` / `0001` 相当の 2 行が入っている → baseline 済み。何もしない。
- 一部だけ入っている等の中途半端な状態 → 必ず内容を精査してから手当てする（安易に再 INSERT しない）。

## (b) baseline する正確な SQL

以下は **既存本番 DB に対して 1 回だけ** 実行します。
2 本のマイグレーションを「適用済み」として登録します。

`created_at` は `packages/db/drizzle/migrations/meta/_journal.json` の `when` の値そのものです。
`hash` は各 SQL ファイル全文の SHA-256 です（drizzle の `crypto.createHash("sha256").update(<file 全文>)` と同一）。
下記の値はこのリポジトリ時点の実値です。

| tag | created_at（= `_journal.json` の when） | hash（SQL 全文の sha256） |
|-----|------------------------------------------|---------------------------|
| `0000_init` | `1780582832156` | `8c90ff4667980ccde354180fcd6b76ec5ceef24ca6568b027099fadd7c385b4b` |
| `0001_deep_switch` | `1782012365465` | `3ee2a39aad04835cf96181a4ae077ae49673125d13167a09ca1062e054337af0` |

```sql
-- 1) 進捗管理用スキーマ・テーブルを作る（drizzle が作るものと同一定義・冪等）
CREATE SCHEMA IF NOT EXISTS drizzle;

CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
  id SERIAL PRIMARY KEY,
  hash text NOT NULL,
  created_at bigint
);

-- 2) 既存の 2 本を「適用済み」として登録（baseline 本体）
--    すでに同一行があると二重登録になるため、空であることを (a) で確認してから実行する
INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES
  ('8c90ff4667980ccde354180fcd6b76ec5ceef24ca6568b027099fadd7c385b4b', 1780582832156),
  ('3ee2a39aad04835cf96181a4ae077ae49673125d13167a09ca1062e054337af0', 1782012365465);
```

実行後の確認:

```sql
SELECT id, hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at;
-- 2 行（0000_init, 0001_deep_switch 相当）が返れば OK
```

### hash 値の出し方（リポジトリ側で再生成する場合）

将来 SQL ファイルが追記・整形され hash が変わったとき、または値を自分で確かめたいときは、
リポジトリルートで以下を実行して再計算できます（`sha256sum` の値が drizzle の hash と一致します）。

```bash
sha256sum packages/db/drizzle/migrations/0000_init.sql
sha256sum packages/db/drizzle/migrations/0001_deep_switch.sql
```

drizzle 内部の算出と完全一致させたい場合は Node で:

```bash
node -e 'const c=require("crypto"),fs=require("fs");for(const t of ["0000_init","0001_deep_switch"]){const q=fs.readFileSync(`packages/db/drizzle/migrations/${t}.sql`).toString();console.log(t, c.createHash("sha256").update(q).digest("hex"));}'
```

### より安全な代替案（hash を厳密に気にしたくない場合）

hash の一致は drizzle の適用判定には使われません（判定は `created_at` ベース）。
そのため hash 値の正確性に不安があるなら、次のいずれかが安全です。

- **fresh（新規）DB を正本にする**: 何もテーブルがない新規 Neon DB に対して `pnpm db:migrate` を 1 回流せば、
  drizzle がテーブル作成・`__drizzle_migrations` への記録まで正規の手順で行ってくれます。
  baseline の手作業 SQL は不要です。本番をこの fresh DB に切り替えられるなら、これが最も確実です。
- **created_at だけ正確にする**: 既存本番をそのまま使う場合でも、`created_at`（= `_journal.json` の `when`）さえ
  正しく入れれば、以降の `pnpm db:migrate` は期待どおり no-op／新規分のみ適用になります。
  `hash` は記録目的なので、上表の実値をそのまま使えば十分です。

## (c) 推奨運用まとめ（fresh と existing の使い分け）

| 対象 | 手順 |
|------|------|
| **fresh（新規）DB** | そのまま `pnpm db:migrate` を実行する。drizzle が全マイグレーションを正規手順で適用し、`__drizzle_migrations` も自動作成される。baseline 不要。|
| **既存本番 DB（テーブルあり・管理テーブルなし）** | このドキュメント (a)→(b) を **1 回だけ** 実行して baseline する。以降は `pnpm db:migrate` が安全な no-op（新規マイグレーションがあればそれだけ適用）になる。|

ポイント:

- baseline は冪等ではない操作（INSERT）を含むため、必ず (a) で空であることを確認してから (b) を実行する。
- baseline 後は、fresh も既存も同じく `pnpm db:migrate` を通常運用にできる。
- 新しいスキーマ変更は `pnpm db:generate` で `0002_...` を生成 → レビュー → `pnpm db:migrate` の通常フロー。

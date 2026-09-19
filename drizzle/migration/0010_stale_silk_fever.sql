-- 境界 install SQL（script/sql/install-skillsheet-write-boundary.sql）が drizzle の外で
-- 適用していたカラム・制約を journal へ取り込む（#344）。境界適用済みの DB でも
-- 失敗しないよう冪等にしてある（ALTER TYPE の再実行は no-op、ADD COLUMN は
-- IF NOT EXISTS、ADD CONSTRAINT は duplicate_object を握る DO ブロック）。
ALTER TABLE "skill_sheets" ALTER COLUMN "revision" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "skill_sheets" ALTER COLUMN "revision" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "skillsheet_state" ADD COLUMN IF NOT EXISTS "deleted_sheet_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "skill_sheets" ADD CONSTRAINT "skill_sheets_revision_nonnegative" CHECK ("skill_sheets"."revision" >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

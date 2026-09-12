CREATE TABLE "skillsheet_state" (
	"owner_id" text PRIMARY KEY NOT NULL,
	"initialized_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "skill_sheets" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement-breakpoint
-- created_at のバックフィルは updated_at を使う（それ以外に手がかりが無いため近似）。
UPDATE "skill_sheets" SET "created_at" = "updated_at";
--> statement-breakpoint
-- 既存シートを持つ owner は「初期化済み」として扱い、初回 seed を再実行させない（S09）。
INSERT INTO "skillsheet_state" ("owner_id")
SELECT DISTINCT "owner_id" FROM "skill_sheets"
ON CONFLICT ("owner_id") DO NOTHING;
ALTER TABLE "skill_sheets" ADD COLUMN "is_default" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- 既存行の既定はこれまで「updated_at 昇順の先頭」で決まっていたため、
-- 各 owner の先頭 1 枚にだけフラグを立てて現在の既定をそのまま引き継ぐ（S09）。
UPDATE "skill_sheets" AS "s"
SET "is_default" = true
WHERE "s"."id" = (
	SELECT "s2"."id" FROM "skill_sheets" AS "s2"
	WHERE "s2"."owner_id" = "s"."owner_id"
	ORDER BY "s2"."updated_at" ASC, "s2"."id" ASC
	LIMIT 1
);--> statement-breakpoint
CREATE UNIQUE INDEX "skill_sheets_owner_default_unique" ON "skill_sheets" USING btree ("owner_id") WHERE "skill_sheets"."is_default";
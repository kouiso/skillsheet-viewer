CREATE TABLE "real_volume_demo_fixtures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"sheet_id" uuid NOT NULL,
	CONSTRAINT "real_volume_demo_fixtures_owner_id_unique" UNIQUE("owner_id")
);
--> statement-breakpoint
ALTER TABLE "real_volume_demo_fixtures" ADD CONSTRAINT "real_volume_demo_fixtures_sheet_id_skill_sheets_id_fk" FOREIGN KEY ("sheet_id") REFERENCES "public"."skill_sheets"("id") ON DELETE cascade ON UPDATE no action;
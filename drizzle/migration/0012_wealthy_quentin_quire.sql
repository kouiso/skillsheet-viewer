CREATE TABLE "drive_destination" (
	"owner_id" text PRIMARY KEY NOT NULL,
	"folder_id" text NOT NULL,
	"folder_name_at_selection" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

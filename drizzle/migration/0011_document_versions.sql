CREATE TABLE "deleted_documents" (
	"sheet_id" uuid PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"revision" bigint NOT NULL,
	"deleted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_versions" (
	"sheet_id" uuid NOT NULL,
	"owner_id" text NOT NULL,
	"revision" bigint NOT NULL,
	"title" text NOT NULL,
	"blocks" jsonb NOT NULL,
	"action" text NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"transaction_id" bigint NOT NULL,
	"restored_from" bigint,
	"restored_before" bigint,
	CONSTRAINT "document_versions_sheet_revision_unique" UNIQUE("sheet_id","revision"),
	CONSTRAINT "document_versions_revision_nonnegative" CHECK ("document_versions"."revision" >= 0)
);
--> statement-breakpoint
CREATE INDEX "deleted_documents_owner_idx" ON "deleted_documents" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "document_versions_owner_sheet_revision_idx" ON "document_versions" USING btree ("owner_id","sheet_id","revision");
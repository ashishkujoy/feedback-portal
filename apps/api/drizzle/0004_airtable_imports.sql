CREATE TYPE "public"."import_status" AS ENUM('pending', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "airtable_imports" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"batch_id" uuid NOT NULL,
	"base_id" text NOT NULL,
	"table_id" text NOT NULL,
	"view" text NOT NULL,
	"status" "import_status" DEFAULT 'pending' NOT NULL,
	"record_count" integer DEFAULT 0 NOT NULL,
	"created_count" integer DEFAULT 0 NOT NULL,
	"updated_count" integer DEFAULT 0 NOT NULL,
	"skipped_count" integer DEFAULT 0 NOT NULL,
	"errors" jsonb,
	"failure_reason" text,
	"imported_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "airtable_imports_counts_check" CHECK ("airtable_imports"."record_count" >= 0 and "airtable_imports"."created_count" >= 0 and "airtable_imports"."updated_count" >= 0 and "airtable_imports"."skipped_count" >= 0),
	CONSTRAINT "airtable_imports_completed_check" CHECK (("airtable_imports"."status" = 'pending') = ("airtable_imports"."completed_at" is null)),
	CONSTRAINT "airtable_imports_failure_check" CHECK (("airtable_imports"."status" = 'failed') = ("airtable_imports"."failure_reason" is not null))
);
--> statement-breakpoint
ALTER TABLE "airtable_imports" ADD CONSTRAINT "airtable_imports_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "airtable_imports" ADD CONSTRAINT "airtable_imports_imported_by_users_id_fk" FOREIGN KEY ("imported_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "airtable_imports_batch_index" ON "airtable_imports" USING btree ("batch_id","created_at");
CREATE TABLE "airtable_field_mappings" (
	"batch_id" uuid PRIMARY KEY NOT NULL,
	"mapping" jsonb NOT NULL,
	"updated_by" uuid NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "airtable_field_mappings" ADD CONSTRAINT "airtable_field_mappings_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "airtable_field_mappings" ADD CONSTRAINT "airtable_field_mappings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
CREATE TYPE "public"."color_code" AS ENUM('green', 'yellow', 'borderline_yellow', 'orange', 'borderline_red', 'red');--> statement-breakpoint
CREATE TYPE "public"."intern_status" AS ENUM('active', 'on_notice', 'graduated', 'terminated', 'withdrawn');--> statement-breakpoint
CREATE TABLE "intern_status_events" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"intern_id" uuid NOT NULL,
	"from_status" "intern_status",
	"to_status" "intern_status" NOT NULL,
	"reason" text,
	"notice_starts_on" date,
	"notice_ends_on" date,
	"feedback_id" uuid,
	"actor_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "intern_status_events_change_check" CHECK ("intern_status_events"."from_status" is distinct from "intern_status_events"."to_status"),
	CONSTRAINT "intern_status_events_onboarding_check" CHECK ("intern_status_events"."from_status" is not null or "intern_status_events"."to_status" = 'active'),
	CONSTRAINT "intern_status_events_reason_check" CHECK ("intern_status_events"."from_status" is null or coalesce("intern_status_events"."reason", '') ~ '[^[:space:]]'),
	CONSTRAINT "intern_status_events_notice_check" CHECK (case when "intern_status_events"."to_status" = 'on_notice'
        then "intern_status_events"."notice_starts_on" is not null and "intern_status_events"."notice_ends_on" is not null
          and "intern_status_events"."notice_ends_on" > "intern_status_events"."notice_starts_on"
        else "intern_status_events"."notice_starts_on" is null and "intern_status_events"."notice_ends_on" is null end)
);
--> statement-breakpoint
CREATE TABLE "interns" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"batch_id" uuid NOT NULL,
	"airtable_record_id" text,
	"username" "citext" NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"diploma_branch" text,
	"parent_names" text,
	"interview_notes" text,
	"airtable_fields" jsonb,
	"photo_public_id" text,
	"status" "intern_status" DEFAULT 'active' NOT NULL,
	"color_code" "color_code",
	"notice_ends_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "interns_notice_check" CHECK (("interns"."status" = 'on_notice') = ("interns"."notice_ends_on" is not null)),
	CONSTRAINT "interns_email_lower_check" CHECK ("interns"."email" = lower("interns"."email")),
	CONSTRAINT "interns_names_check" CHECK ("interns"."username" ~ '[^[:space:]]' and "interns"."name" ~ '[^[:space:]]')
);
--> statement-breakpoint
ALTER TABLE "intern_status_events" ADD CONSTRAINT "intern_status_events_intern_id_interns_id_fk" FOREIGN KEY ("intern_id") REFERENCES "public"."interns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intern_status_events" ADD CONSTRAINT "intern_status_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interns" ADD CONSTRAINT "interns_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "intern_status_events_intern_index" ON "intern_status_events" USING btree ("intern_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "interns_batch_username_unique" ON "interns" USING btree ("batch_id","username");--> statement-breakpoint
CREATE INDEX "interns_batch_status_index" ON "interns" USING btree ("batch_id","status");--> statement-breakpoint
-- Hand-written (not generated): intern status history is append-only. TRUNCATE (test cleanup)
-- is not affected; UPDATE and DELETE are rejected whatever their source.
CREATE FUNCTION "public"."intern_status_events_append_only"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'intern_status_events is append-only: % is not allowed', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "intern_status_events_append_only"
  BEFORE UPDATE OR DELETE ON "intern_status_events"
  FOR EACH ROW EXECUTE FUNCTION "public"."intern_status_events_append_only"();

CREATE TYPE "public"."feedback_state" AS ENUM('draft', 'submitted', 'delivered');--> statement-breakpoint
CREATE TABLE "feedback" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"intern_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"period" date NOT NULL,
	"body" text NOT NULL,
	"color_code" "color_code",
	"previous_color_code" "color_code",
	"gives_notice" boolean DEFAULT false NOT NULL,
	"state" "feedback_state" DEFAULT 'draft' NOT NULL,
	"conversation_id" uuid,
	"submitted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feedback_period_check" CHECK (extract(day from "feedback"."period") = 1),
	CONSTRAINT "feedback_submitted_check" CHECK (("feedback"."state" = 'draft') = ("feedback"."submitted_at" is null)),
	CONSTRAINT "feedback_delivered_check" CHECK (("feedback"."state" = 'delivered') = ("feedback"."conversation_id" is not null)),
	CONSTRAINT "feedback_previous_color_check" CHECK ("feedback"."state" <> 'draft' or "feedback"."previous_color_code" is null),
	CONSTRAINT "feedback_body_check" CHECK ("feedback"."state" = 'draft' or "feedback"."body" ~ '[^[:space:]]')
);
--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_intern_id_interns_id_fk" FOREIGN KEY ("intern_id") REFERENCES "public"."interns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "feedback_intern_period_index" ON "feedback" USING btree ("intern_id","period");--> statement-breakpoint
CREATE INDEX "feedback_intern_colored_index" ON "feedback" USING btree ("intern_id","submitted_at") WHERE "feedback"."color_code" is not null;--> statement-breakpoint
CREATE INDEX "feedback_author_state_index" ON "feedback" USING btree ("author_id","state");--> statement-breakpoint
ALTER TABLE "intern_status_events" ADD CONSTRAINT "intern_status_events_feedback_id_feedback_id_fk" FOREIGN KEY ("feedback_id") REFERENCES "public"."feedback"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intern_status_events" ADD CONSTRAINT "intern_status_events_feedback_check" CHECK ("intern_status_events"."feedback_id" is null or "intern_status_events"."to_status" = 'on_notice');--> statement-breakpoint
-- Hand-written (not generated): only a draft can be deleted (its author discards it), and
-- delivered feedback never changes. TRUNCATE (test cleanup) is not affected.
CREATE FUNCTION "public"."feedback_protect"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD.state <> 'draft' THEN
    RAISE EXCEPTION 'feedback: only a draft can be deleted, not % feedback', OLD.state
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.state = 'delivered' THEN
    RAISE EXCEPTION 'feedback: delivered feedback can''t be changed'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "feedback_protect"
  BEFORE UPDATE OR DELETE ON "feedback"
  FOR EACH ROW EXECUTE FUNCTION "public"."feedback_protect"();

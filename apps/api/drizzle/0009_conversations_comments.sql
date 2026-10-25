CREATE TABLE "comments" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"feedback_id" uuid,
	"conversation_id" uuid,
	"author_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"edited_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "comments_parent_check" CHECK (num_nonnulls("comments"."feedback_id", "comments"."conversation_id") = 1),
	CONSTRAINT "comments_body_check" CHECK ("comments"."deleted_at" is not null or "comments"."body" ~ '[^[:space:]]')
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"intern_id" uuid NOT NULL,
	"recorded_by" uuid NOT NULL,
	"held_on" date NOT NULL,
	"notes" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"edited_at" timestamp with time zone,
	CONSTRAINT "conversations_notes_check" CHECK ("conversations"."notes" ~ '[^[:space:]]')
);
--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_feedback_id_feedback_id_fk" FOREIGN KEY ("feedback_id") REFERENCES "public"."feedback"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_intern_id_interns_id_fk" FOREIGN KEY ("intern_id") REFERENCES "public"."interns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comments_feedback_index" ON "comments" USING btree ("feedback_id","created_at") WHERE "comments"."feedback_id" is not null;--> statement-breakpoint
CREATE INDEX "comments_conversation_index" ON "comments" USING btree ("conversation_id","created_at") WHERE "comments"."conversation_id" is not null;--> statement-breakpoint
CREATE INDEX "conversations_intern_held_index" ON "conversations" USING btree ("intern_id","held_on");--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "feedback_conversation_unique" ON "feedback" USING btree ("conversation_id");--> statement-breakpoint
-- Hand-written (not generated): a conversation is never deleted (10.1 decision 2), and a comment
-- is never hard-deleted nor changed once soft-deleted (decision 3). TRUNCATE (test cleanup) is
-- not affected.
CREATE FUNCTION "public"."conversations_protect"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'conversations: a conversation can''t be deleted'
    USING ERRCODE = 'restrict_violation';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "conversations_protect"
  BEFORE DELETE ON "conversations"
  FOR EACH ROW EXECUTE FUNCTION "public"."conversations_protect"();--> statement-breakpoint
CREATE FUNCTION "public"."comments_protect"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'comments: a comment is deleted by clearing it, not removing it'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'comments: a deleted comment can''t be changed'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "comments_protect"
  BEFORE UPDATE OR DELETE ON "comments"
  FOR EACH ROW EXECUTE FUNCTION "public"."comments_protect"();
